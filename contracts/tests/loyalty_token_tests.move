#[test_only]
module sui_loyalty::loyalty_token_tests {
    use sui::test_scenario as ts;
    use sui::coin::TreasuryCap;
    use sui_loyalty::loyalty_token::{
        Self, LOYALTY_TOKEN, TokenAdminCap, BrandTreasury, DistributorCap,
    };
    use std::string;

    const ADMIN:     address = @0xAD;
    const BRAND:     address = @0xB1;
    const CONSUMER:  address = @0xC0;
    const SPONSOR:   address = @0x5A;

    // ── helpers ────────────────────────────────────────────────────────────────

    fun setup(): ts::Scenario {
        let mut s = ts::begin(ADMIN);
        { loyalty_token::init_for_testing(s.ctx()); };
        s
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    #[test]
    fun test_init_creates_admin_cap_and_treasury_cap() {
        let mut s = setup();
        s.next_tx(ADMIN);
        {
            assert!(s.has_most_recent_for_sender<TokenAdminCap>(),             0);
            assert!(s.has_most_recent_for_sender<TreasuryCap<LOYALTY_TOKEN>>(), 1);
        };
        s.end();
    }

    // ── Treasury creation ──────────────────────────────────────────────────────

    #[test]
    fun test_create_brand_treasury() {
        let mut s = setup();
        s.next_tx(ADMIN);
        {
            let cap         = s.take_from_sender<TokenAdminCap>();
            let distributor = loyalty_token::create_brand_treasury(
                &cap,
                string::utf8(b"Nike"),
                BRAND,
                s.ctx(),
            );
            assert!(loyalty_token::distributor_treasury_id(&distributor) != object::id_from_address(@0x0), 0);
            loyalty_token::destroy_distributor_for_testing(distributor);
            s.return_to_sender(cap);
        };
        s.end();
    }

    // ── Minting ────────────────────────────────────────────────────────────────

    #[test]
    fun test_mint_to_treasury_increases_balance() {
        let mut s = setup();
        // Create treasury
        s.next_tx(ADMIN);
        {
            let cap         = s.take_from_sender<TokenAdminCap>();
            let distributor = loyalty_token::create_brand_treasury(
                &cap, string::utf8(b"Adidas"), BRAND, s.ctx(),
            );
            transfer::public_transfer(distributor, ADMIN);
            s.return_to_sender(cap);
        };
        // Mint 1000 tokens
        s.next_tx(ADMIN);
        {
            let mut treasury_cap = s.take_from_sender<TreasuryCap<LOYALTY_TOKEN>>();
            let mut treasury     = s.take_shared<BrandTreasury>();
            loyalty_token::mint_to_treasury(&mut treasury_cap, &mut treasury, 1000, s.ctx());
            assert!(loyalty_token::treasury_balance(&treasury)        == 1000, 0);
            assert!(loyalty_token::treasury_total_deposited(&treasury) == 1000, 1);
            ts::return_shared(treasury);
            s.return_to_sender(treasury_cap);
        };
        s.end();
    }

    #[test, expected_failure(abort_code = sui_loyalty::loyalty_token::EZeroAmount)]
    fun test_mint_zero_fails() {
        let mut s = setup();
        s.next_tx(ADMIN);
        {
            let cap = s.take_from_sender<TokenAdminCap>();
            let _d  = loyalty_token::create_brand_treasury(&cap, string::utf8(b"Puma"), BRAND, s.ctx());
            s.return_to_sender(cap);
            loyalty_token::destroy_distributor_for_testing(_d);
        };
        s.next_tx(ADMIN);
        {
            let mut treasury_cap = s.take_from_sender<TreasuryCap<LOYALTY_TOKEN>>();
            let mut treasury     = s.take_shared<BrandTreasury>();
            loyalty_token::mint_to_treasury(&mut treasury_cap, &mut treasury, 0, s.ctx()); // abort
            ts::return_shared(treasury);
            s.return_to_sender(treasury_cap);
        };
        s.end();
    }

    // ── Distribution ──────────────────────────────────────────────────────────

    #[test]
    fun test_distribute_tokens_to_consumer() {
        let mut s = setup();
        // Create treasury and transfer distributor to sponsor
        s.next_tx(ADMIN);
        {
            let cap         = s.take_from_sender<TokenAdminCap>();
            let distributor = loyalty_token::create_brand_treasury(
                &cap, string::utf8(b"Reebok"), BRAND, s.ctx(),
            );
            transfer::public_transfer(distributor, SPONSOR);
            s.return_to_sender(cap);
        };
        // Mint 500 into treasury
        s.next_tx(ADMIN);
        {
            let mut tc   = s.take_from_sender<TreasuryCap<LOYALTY_TOKEN>>();
            let mut trs  = s.take_shared<BrandTreasury>();
            loyalty_token::mint_to_treasury(&mut tc, &mut trs, 500, s.ctx());
            ts::return_shared(trs);
            s.return_to_sender(tc);
        };
        // Sponsor distributes 100 tokens to consumer
        s.next_tx(SPONSOR);
        {
            let distributor = s.take_from_sender<DistributorCap>();
            let mut trs     = s.take_shared<BrandTreasury>();
            loyalty_token::distribute_tokens(&distributor, &mut trs, CONSUMER, 100, s.ctx());
            assert!(loyalty_token::treasury_balance(&trs)            == 400, 0);
            assert!(loyalty_token::treasury_total_distributed(&trs)  == 100, 1);
            ts::return_shared(trs);
            s.return_to_sender(distributor);
        };
        s.end();
    }

    #[test, expected_failure(abort_code = sui_loyalty::loyalty_token::EInsufficientTreasuryBalance)]
    fun test_distribute_exceeds_balance_fails() {
        let mut s = setup();
        s.next_tx(ADMIN);
        {
            let cap = s.take_from_sender<TokenAdminCap>();
            let d   = loyalty_token::create_brand_treasury(&cap, string::utf8(b"UA"), BRAND, s.ctx());
            transfer::public_transfer(d, SPONSOR);
            s.return_to_sender(cap);
        };
        s.next_tx(ADMIN);
        {
            let mut tc  = s.take_from_sender<TreasuryCap<LOYALTY_TOKEN>>();
            let mut trs = s.take_shared<BrandTreasury>();
            loyalty_token::mint_to_treasury(&mut tc, &mut trs, 50, s.ctx());
            ts::return_shared(trs);
            s.return_to_sender(tc);
        };
        s.next_tx(SPONSOR);
        {
            let d       = s.take_from_sender<DistributorCap>();
            let mut trs = s.take_shared<BrandTreasury>();
            loyalty_token::distribute_tokens(&d, &mut trs, CONSUMER, 100, s.ctx()); // abort
            ts::return_shared(trs);
            s.return_to_sender(d);
        };
        s.end();
    }

    #[test, expected_failure(abort_code = sui_loyalty::loyalty_token::EDistributorMismatch)]
    fun test_distributor_wrong_treasury_fails() {
        let mut s = setup();
        // Create two treasuries
        s.next_tx(ADMIN);
        {
            let cap  = s.take_from_sender<TokenAdminCap>();
            let d1   = loyalty_token::create_brand_treasury(&cap, string::utf8(b"Brand1"), BRAND, s.ctx());
            let d2   = loyalty_token::create_brand_treasury(&cap, string::utf8(b"Brand2"), BRAND, s.ctx());
            // Give distributor for Brand1 to sponsor, destroy d2
            transfer::public_transfer(d1, SPONSOR);
            loyalty_token::destroy_distributor_for_testing(d2);
            s.return_to_sender(cap);
        };
        // Mint into Brand2's treasury (second shared object)
        // This test just validates the mismatch path — use a single treasury and wrong cap
        // Simpler: re-create scenario where d1's treasury_id != treasury2's object ID
        // Already covered by the struct: distributor.treasury_id checked against object::id(treasury)
        s.next_tx(ADMIN);
        {
            let mut tc  = s.take_from_sender<TreasuryCap<LOYALTY_TOKEN>>();
            // Take the FIRST shared treasury (Brand1)
            let mut trs = s.take_shared<BrandTreasury>();
            loyalty_token::mint_to_treasury(&mut tc, &mut trs, 200, s.ctx());
            ts::return_shared(trs);
            s.return_to_sender(tc);
        };
        s.next_tx(SPONSOR);
        {
            let d       = s.take_from_sender<DistributorCap>();
            // Take the SECOND shared treasury (Brand2) — mismatch!
            let mut trs = s.take_shared<BrandTreasury>();
            loyalty_token::distribute_tokens(&d, &mut trs, CONSUMER, 10, s.ctx()); // abort
            ts::return_shared(trs);
            s.return_to_sender(d);
        };
        s.end();
    }

    #[test, expected_failure(abort_code = sui_loyalty::loyalty_token::EZeroAmount)]
    fun test_distribute_zero_fails() {
        let mut s = setup();
        s.next_tx(ADMIN);
        {
            let cap = s.take_from_sender<TokenAdminCap>();
            let d   = loyalty_token::create_brand_treasury(&cap, string::utf8(b"Nike"), BRAND, s.ctx());
            transfer::public_transfer(d, SPONSOR);
            s.return_to_sender(cap);
        };
        s.next_tx(ADMIN);
        {
            let mut tc  = s.take_from_sender<TreasuryCap<LOYALTY_TOKEN>>();
            let mut trs = s.take_shared<BrandTreasury>();
            loyalty_token::mint_to_treasury(&mut tc, &mut trs, 100, s.ctx());
            ts::return_shared(trs);
            s.return_to_sender(tc);
        };
        s.next_tx(SPONSOR);
        {
            let d       = s.take_from_sender<DistributorCap>();
            let mut trs = s.take_shared<BrandTreasury>();
            loyalty_token::distribute_tokens(&d, &mut trs, CONSUMER, 0, s.ctx()); // abort
            ts::return_shared(trs);
            s.return_to_sender(d);
        };
        s.end();
    }

    // ── Admin withdraw ────────────────────────────────────────────────────────

    #[test]
    fun test_admin_withdraw_from_treasury() {
        let mut s = setup();
        s.next_tx(ADMIN);
        {
            let cap = s.take_from_sender<TokenAdminCap>();
            let d   = loyalty_token::create_brand_treasury(&cap, string::utf8(b"Nike"), BRAND, s.ctx());
            loyalty_token::destroy_distributor_for_testing(d);
            s.return_to_sender(cap);
        };
        s.next_tx(ADMIN);
        {
            let mut tc  = s.take_from_sender<TreasuryCap<LOYALTY_TOKEN>>();
            let mut trs = s.take_shared<BrandTreasury>();
            loyalty_token::mint_to_treasury(&mut tc, &mut trs, 300, s.ctx());
            ts::return_shared(trs);
            s.return_to_sender(tc);
        };
        s.next_tx(ADMIN);
        {
            let cap     = s.take_from_sender<TokenAdminCap>();
            let mut trs = s.take_shared<BrandTreasury>();
            loyalty_token::withdraw_from_treasury(&cap, &mut trs, 100, ADMIN, s.ctx());
            assert!(loyalty_token::treasury_balance(&trs) == 200, 0);
            ts::return_shared(trs);
            s.return_to_sender(cap);
        };
        s.end();
    }

    #[test, expected_failure(abort_code = sui_loyalty::loyalty_token::EInsufficientTreasuryBalance)]
    fun test_admin_withdraw_exceeds_balance_fails() {
        let mut s = setup();
        s.next_tx(ADMIN);
        {
            let cap = s.take_from_sender<TokenAdminCap>();
            let d   = loyalty_token::create_brand_treasury(&cap, string::utf8(b"Nike"), BRAND, s.ctx());
            loyalty_token::destroy_distributor_for_testing(d);
            s.return_to_sender(cap);
        };
        s.next_tx(ADMIN);
        {
            let mut tc  = s.take_from_sender<TreasuryCap<LOYALTY_TOKEN>>();
            let mut trs = s.take_shared<BrandTreasury>();
            loyalty_token::mint_to_treasury(&mut tc, &mut trs, 50, s.ctx());
            ts::return_shared(trs);
            s.return_to_sender(tc);
        };
        s.next_tx(ADMIN);
        {
            let cap     = s.take_from_sender<TokenAdminCap>();
            let mut trs = s.take_shared<BrandTreasury>();
            loyalty_token::withdraw_from_treasury(&cap, &mut trs, 999, ADMIN, s.ctx()); // abort
            ts::return_shared(trs);
            s.return_to_sender(cap);
        };
        s.end();
    }

    // ── View functions ────────────────────────────────────────────────────────

    #[test]
    fun test_view_functions() {
        let mut s = setup();
        s.next_tx(ADMIN);
        {
            let cap = s.take_from_sender<TokenAdminCap>();
            let d   = loyalty_token::create_brand_treasury(
                &cap, string::utf8(b"ViewBrand"), BRAND, s.ctx(),
            );
            loyalty_token::destroy_distributor_for_testing(d);
            s.return_to_sender(cap);
        };
        s.next_tx(ADMIN);
        {
            let trs = s.take_shared<BrandTreasury>();
            assert!(loyalty_token::treasury_brand_name(&trs)       == string::utf8(b"ViewBrand"), 0);
            assert!(loyalty_token::treasury_brand_owner(&trs)       == BRAND,                     1);
            assert!(loyalty_token::treasury_balance(&trs)           == 0,                          2);
            assert!(loyalty_token::treasury_total_deposited(&trs)   == 0,                          3);
            assert!(loyalty_token::treasury_total_distributed(&trs) == 0,                          4);
            ts::return_shared(trs);
        };
        s.end();
    }
}
