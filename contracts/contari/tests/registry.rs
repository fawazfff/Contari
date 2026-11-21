use bech32::{Bech32m, Hrp, encode};
use tari_template_test_tooling::{TemplateTest, transaction::args};

fn ootle_address(owner_key: &[u8; 32], hrp: &str) -> String {
    let mut payload = Vec::with_capacity(64);
    payload.extend_from_slice(owner_key);
    payload.extend_from_slice(owner_key);
    encode::<Bech32m>(Hrp::parse(hrp).unwrap(), &payload).unwrap()
}

fn deploy_registry(test: &mut TemplateTest) -> tari_template_lib::types::ComponentAddress {
    let template = test.get_template_address("ContariRegistry");
    test.execute_expect_success(
        test.transaction()
            .call_function(template, "new", args![])
            .build_and_seal(test.secret_key()),
        vec![test.owner_proof()],
    );
    test.read_only_state_store()
        .get_components_by_template_address(template)
        .unwrap()
        .into_iter()
        .next()
        .expect("registry component should be instantiated")
        .0
}

#[test]
fn registry_registers_wallet_gate_and_allows_repeat_claims_idempotently() {
    let mut test = TemplateTest::my_crate();
    let component = deploy_registry(&mut test);
    let signer = test.to_public_key_bytes();
    let address = ootle_address(signer.as_bytes(), "otl_");
    let locker_hash = "a".repeat(64);

    test.execute_expect_success(
        test.transaction()
            .call_method(
                component,
                "register_locker",
                args![locker_hash.clone(), 0u8, "wallet".to_string(), Vec::<String>::new()],
            )
            .build_and_seal(test.secret_key()),
        vec![test.owner_proof()],
    );

    for _ in 0..2 {
        test.execute_expect_success(
            test.transaction()
                .call_method(
                    component,
                    "claim_locker",
                    args![locker_hash.clone(), 0u8, address.clone()],
                )
                .build_and_seal(test.secret_key()),
            vec![test.owner_proof()],
        );
    }

    let counts: (u64, u64) = test.call_method(component, "get_counts", args![], vec![]);
    assert_eq!(counts, (1, 1), "repeat claims must not inflate the unique claim counter");
}

#[test]
fn registry_rejects_invalid_hashes_and_wrong_network_claims() {
    let mut test = TemplateTest::my_crate();
    let component = deploy_registry(&mut test);

    let bad_hash = "A".repeat(64);
    let bad_registration = test.transaction()
        .call_method(
            component,
            "register_locker",
            args![bad_hash, 0u8, "wallet".to_string(), Vec::<String>::new()],
        )
        .build_and_seal(test.secret_key());
    test.execute_expect_failure(bad_registration, vec![test.owner_proof()]);

    let signer = test.to_public_key_bytes();
    let address = ootle_address(signer.as_bytes(), "otl_");
    let locker_hash = "b".repeat(64);
    test.execute_expect_success(
        test.transaction()
            .call_method(
                component,
                "register_locker",
                args![locker_hash.clone(), 0u8, "wallet".to_string(), Vec::<String>::new()],
            )
            .build_and_seal(test.secret_key()),
        vec![test.owner_proof()],
    );

    let wrong_network = test.transaction()
        .call_method(
            component,
            "claim_locker",
            args![locker_hash, 38u8, address],
        )
        .build_and_seal(test.secret_key());
    test.execute_expect_failure(wrong_network, vec![test.owner_proof()]);
}

#[test]
fn registry_rejects_allowlist_claims_from_unlisted_wallets() {
    let mut test = TemplateTest::my_crate();
    let component = deploy_registry(&mut test);
    let creator = test.to_public_key_bytes();
    let allowed_address = ootle_address(creator.as_bytes(), "otl_");
    let locker_hash = "c".repeat(64);

    test.execute_expect_success(
        test.transaction()
            .call_method(
                component,
                "register_locker",
                args![locker_hash.clone(), 0u8, "allowlist".to_string(), vec![allowed_address]],
            )
            .build_and_seal(test.secret_key()),
        vec![test.owner_proof()],
    );

    let (attacker_proof, attacker_key, attacker_secret) = test.create_owner_proof();
    let attacker_address = ootle_address(attacker_key.as_bytes(), "otl_");
    let unauthorized_claim = test.transaction()
        .call_method(
            component,
            "claim_locker",
            args![locker_hash, 0u8, attacker_address],
        )
        .build_and_seal(&attacker_secret);
    test.execute_expect_failure(unauthorized_claim, vec![attacker_proof]);
}
