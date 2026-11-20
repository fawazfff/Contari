use tari_template_lib::prelude::*;

#[template]
mod contari {
    use super::*;

    pub struct ContariRegistry {
        owner: ComponentAddress,
        claim_count: u64,
        locker_count: u64,
    }

    impl ContariRegistry {
        pub fn new() -> Component<Self> {
            Component::new(Self {
                owner: CallerContext::caller(),
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

        // Records that a locker was created. The app must not put private content here.
        pub fn register_locker(&mut self, locker_id_hash: String) {
            assert!(!locker_id_hash.is_empty(), "locker id hash is required");
            self.locker_count += 1;
            emit_event("LockerRegistered", locker_id_hash);
        }

        // Records a wallet claim reference. A production version must verify ownership
        // proofs and enforce access policy before accepting this call.
        pub fn record_claim(&mut self, locker_id_hash: String, wallet_address: String) {
            assert!(!locker_id_hash.is_empty(), "locker id hash is required");
            assert!(!wallet_address.is_empty(), "wallet address is required");
            self.claim_count += 1;
            emit_event("LockerClaimed", (locker_id_hash, wallet_address));
        }

        pub fn get_counts(&self) -> (u64, u64) {
            (self.locker_count, self.claim_count)
        }
    }
}