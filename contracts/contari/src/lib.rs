use tari_template_lib::prelude::*;

#[template]
mod contari {
    use super::*;

    pub struct ContariRegistry {
        owner: RistrettoPublicKeyBytes,
        claim_count: u64,
        locker_count: u64,
    }

    impl ContariRegistry {
        pub fn new() -> Component<Self> {
            Component::new(Self {
                owner: CallerContext::transaction_signer_public_key(),
                claim_count: 0,
                locker_count: 0,
            })
            .with_access_rules(
                ComponentAccessRules::new()
                    .method("register_locker", rule!(allow_all))
                    .method("record_claim", rule!(allow_all))
                    .method("get_counts", rule!(allow_all))
                    .default(rule!(deny_all)),
            )
            .create()
        }

        // Records a hash/reference only. Private content must never be written on-chain.
        pub fn register_locker(&mut self, locker_id_hash: String) {
            assert!(!locker_id_hash.is_empty(), "locker id hash is required");
            self.locker_count += 1;
            emit_event("LockerRegistered", [("locker_id_hash", locker_id_hash)]);
        }

        // Prototype event only. A production method must verify a fresh ownership proof
        // and enforce the selected access policy before accepting a claim.
        pub fn record_claim(&mut self, locker_id_hash: String, wallet_address: String) {
            assert!(!locker_id_hash.is_empty(), "locker id hash is required");
            assert!(!wallet_address.is_empty(), "wallet address is required");
            self.claim_count += 1;
            emit_event("LockerClaimed", [
                ("locker_id_hash", locker_id_hash),
                ("wallet_address", wallet_address),
            ]);
        }

        pub fn get_counts(&self) -> (u64, u64) {
            (self.locker_count, self.claim_count)
        }
    }
}