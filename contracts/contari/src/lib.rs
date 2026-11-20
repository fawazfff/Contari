use tari_template_lib::prelude::*;

#[template]
mod contari {
    use super::*;
    use bech32::{Bech32m, primitives::decode::CheckedHrpstring};

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
                    .method("register_locker", rule!(allow_all))
                    .method("claim_locker", rule!(allow_all))
                    .method("get_counts", rule!(allow_all))
                    .default(rule!(deny_all)),
            )
            .create()
        }

        /// Registers a hash only. The caller is the authenticated transaction signer.
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

        /// A successful wallet-signed Ootle transaction authenticates the signer.
        /// The wallet address is decoded and its owner key must equal that signer.
        pub fn claim_locker(&mut self, locker_id_hash: String, network: u8, wallet_address: String) {
            assert!(is_canonical_hash(&locker_id_hash), "invalid locker id hash");
            let index = self.lockers.iter().position(|item| item.locker_id_hash == locker_id_hash)
                .expect("locker is not registered on Ootle");
            let signer = CallerContext::transaction_signer_public_key();
            let address_key = address_owner(&wallet_address, network).expect("invalid wallet address or network");
            assert!(address_key == signer, "wallet address does not belong to the transaction signer");

            let record = &self.lockers[index];
            assert!(record.network == network, "wallet network does not match locker network");
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
}
