use tari_template_lib::prelude::*;

#[template]
mod contari {
    use super::*;
    use bech32::{Bech32m, primitives::decode::CheckedHrpstring};
    use blake2::{Blake2b, Digest, digest::consts::U64};

    const WALLET_GATE: &str = "wallet";
    const ALLOWLIST_GATE: &str = "allowlist";

    pub struct LockerRecord {
        locker_id_hash: String,
        creator: RistrettoPublicKeyBytes,
        network: u8,
        gate: String,
        allowed_wallets: Vec<RistrettoPublicKeyBytes>,
        claimed_wallets: Vec<RistrettoPublicKeyBytes>,
    }

    pub struct ContariRegistry {
        lockers: Vec<LockerRecord>,
        locker_count: u64,
        claim_count: u64,
    }

    impl ContariRegistry {
        pub fn new() -> Component<Self> {
            Component::new(Self {
                lockers: Vec::new(),
                locker_count: 0,
                claim_count: 0,
            })
            .with_access_rules(
                ComponentAccessRules::new()
                    // These entry points are public, but every identity-sensitive action
                    // checks the authenticated transaction signer inside the method.
                    .method("register_locker", rule!(allow_all))
                    .method("claim_locker", rule!(allow_all))
                    .method("get_counts", rule!(allow_all))
                    .default(rule!(deny_all)),
            )
            .create()
        }

        /// Register a locker using the authenticated creator signer. Only a hash of the
        /// off-chain locker id is written to Ootle, never the content or decryption key.
        pub fn register_locker(
            &mut self,
            locker_id_hash: String,
            network: u8,
            gate: String,
            allowed_wallet_addresses: Vec<String>,
        ) {
            assert!(is_canonical_hash(&locker_id_hash), "locker id must be a 32-byte lowercase hex hash");
            assert!(gate == WALLET_GATE || gate == ALLOWLIST_GATE, "unsupported access gate");
            assert!(!self.lockers.iter().any(|item| item.locker_id_hash == locker_id_hash), "locker already registered");
            let creator = CallerContext::transaction_signer_public_key();
            let mut allowed_wallets = Vec::new();

            if gate == ALLOWLIST_GATE {
                assert!(!allowed_wallet_addresses.is_empty(), "allowlist cannot be empty");
                for address in allowed_wallet_addresses {
                    let key = address_owner(&address, network).expect("invalid or wrong-network allowlist address");
                    assert!(!allowed_wallets.contains(&key), "duplicate allowlist wallet");
                    allowed_wallets.push(key);
                }
            } else {
                assert!(allowed_wallet_addresses.is_empty(), "wallet gate cannot include an allowlist");
            }

            self.lockers.push(LockerRecord {
                locker_id_hash: locker_id_hash.clone(),
                creator,
                network,
                gate,
                allowed_wallets,
                claimed_wallets: Vec::new(),
            });
            self.locker_count += 1;
            emit_event("LockerRegistered", [("locker_id_hash", locker_id_hash)]);
        }

        /// Verify Tari's wallet-ownership challenge on-chain and bind the claim to the
        /// transaction's authenticated signer. A supplied address or key alone is never trusted.
        pub fn claim_locker(
            &mut self,
            locker_id_hash: String,
            network: u8,
            wallet_address: String,
            challenge: String,
            public_nonce_hex: String,
            signature_hex: String,
        ) {
            assert!(is_canonical_hash(&locker_id_hash), "invalid locker id hash");
            let index = self.lockers.iter().position(|item| item.locker_id_hash == locker_id_hash)
                .expect("locker is not registered on Ootle");
            let signer = CallerContext::transaction_signer_public_key();
            let record = &self.lockers[index];

            assert!(record.network == network, "wallet network does not match locker network");
            let address_key = address_owner(&wallet_address, network).expect("invalid wallet address or network");
            assert!(address_key == signer, "wallet address does not belong to the transaction signer");
            assert!(verify_wallet_ownership_proof(
                network,
                &wallet_address,
                &challenge,
                signer,
                &public_nonce_hex,
                &signature_hex,
            ), "invalid Tari wallet ownership signature");

            if record.gate == ALLOWLIST_GATE {
                assert!(record.allowed_wallets.contains(&signer), "wallet is not on the locker allowlist");
            }
            assert!(!record.claimed_wallets.contains(&signer), "this wallet has already claimed this locker");

            self.lockers[index].claimed_wallets.push(signer);
            self.claim_count += 1;
            emit_event("LockerClaimed", [
                ("locker_id_hash", locker_id_hash),
                ("claimant_key", signer.to_string()),
            ]);
        }

        pub fn get_counts(&self) -> (u64, u64) {
            (self.locker_count, self.claim_count)
        }
    }

    fn is_canonical_hash(value: &str) -> bool {
        value.len() == 64 && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    }

    fn network_hrp(network: u8) -> Option<&'static str> {
        match network {
            0 => Some("otl_"),
            16 => Some("otl_loc_"),
            36 => Some("otl_igr_"),
            38 => Some("otl_esm_"),
            _ => None,
        }
    }

    fn address_owner(address: &str, network: u8) -> Option<RistrettoPublicKeyBytes> {
        if address.len() > 128 || !address.is_ascii() {
            return None;
        }
        let expected_hrp = network_hrp(network)?;
        let checked = CheckedHrpstring::new::<Bech32m>(address).ok()?;
        if checked.hrp().as_str() != expected_hrp {
            return None;
        }
        let data: Vec<u8> = checked.byte_iter().collect();
        if data.len() != 64 || bech32::encode::<Bech32m>(checked.hrp(), &data).ok()? != address {
            return None;
        }
        let owner: RistrettoPublicKeyBytes = <[u8; 32]>::try_from(&data[..32]).ok()?.into();
        let view: RistrettoPublicKeyBytes = <[u8; 32]>::try_from(&data[32..]).ok()?.into();
        if !intrinsics::ristretto_is_canonical(&owner)
            || !intrinsics::ristretto_is_canonical(&view)
            || intrinsics::ristretto_is_identity(&owner)
            || intrinsics::ristretto_is_identity(&view)
        {
            return None;
        }
        Some(owner)
    }

    fn domain_hash(tag: &str, fields: &[&[u8]]) -> [u8; 64] {
        let mut hasher = Blake2b::<U64>::new();
        hasher.update((tag.len() as u64).to_le_bytes());
        hasher.update(tag.as_bytes());
        for field in fields {
            hasher.update((field.len() as u64).to_le_bytes());
            hasher.update(field);
        }
        hasher.finalize().into()
    }

    fn decode_hex_32(value: &str) -> Option<[u8; 32]> {
        if value.len() != 64 || !value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
            return None;
        }
        let mut bytes = [0u8; 32];
        for (index, byte) in bytes.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).ok()?;
        }
        Some(bytes)
    }

    fn verify_wallet_ownership_proof(
        network: u8,
        address: &str,
        challenge: &str,
        owner_key: RistrettoPublicKeyBytes,
        public_nonce_hex: &str,
        signature_hex: &str,
    ) -> bool {
        if challenge.is_empty() || !challenge.is_ascii() || challenge.len() > 500 {
            return false;
        }
        let Some(nonce_bytes) = decode_hex_32(public_nonce_hex) else { return false; };
        let Some(signature_bytes) = decode_hex_32(signature_hex) else { return false; };
        let nonce: RistrettoPublicKeyBytes = nonce_bytes.into();
        let signature: Scalar32Bytes = signature_bytes.into();

        if !intrinsics::ristretto_is_canonical(&nonce)
            || intrinsics::ristretto_is_identity(&nonce)
            || !intrinsics::scalar_is_canonical(&signature)
        {
            return false;
        }

        let message = domain_hash(
            "com.tari.paylink.wallet_ownership_proof.v1.v1",
            &[&[network], address.as_bytes(), challenge.as_bytes()],
        );
        let challenge_scalar = intrinsics::scalar_from_uniform_bytes(&domain_hash(
            "com.tari.schnorr_signature.v1.challenge",
            &[nonce.as_bytes(), owner_key.as_bytes(), &message],
        ));

        intrinsics::ristretto_mul_base(&signature)
            == intrinsics::ristretto_add(
                &nonce,
                &intrinsics::ristretto_mul(&owner_key, &challenge_scalar),
            )
    }
}
