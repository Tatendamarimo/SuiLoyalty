#[test_only]
module sui_loyalty::loyalty_card_tests {
    use sui::test_scenario as ts;
    use sui_loyalty::loyalty_card;
    use std::string;

    const USER: address = @0xA;

    #[test]
    fun test_create_card() {
        let mut scenario = ts::begin(USER);
        {
            loyalty_card::mint_card(
                string::utf8(b"Tatenda"),
                scenario.ctx()
            );
        };
        scenario.next_tx(USER);
        {
            let card = scenario.take_from_sender<loyalty_card::LoyaltyCard>();
            assert!(loyalty_card::points(&card) == 0, 0);
            assert!(loyalty_card::tier(&card) == 0, 0);
            assert!(loyalty_card::scan_count(&card) == 0, 0);
            scenario.return_to_sender(card);
        };
        scenario.end();
    }

    #[test]
    fun test_earn_points_and_tier() {
        let mut scenario = ts::begin(USER);
        {
            loyalty_card::mint_card(
                string::utf8(b"Tatenda"),
                scenario.ctx()
            );
        };
        scenario.next_tx(USER);
        {
            let mut card = scenario.take_from_sender<loyalty_card::LoyaltyCard>();
            loyalty_card::earn_points(&mut card, 100);
            assert!(loyalty_card::points(&card) == 100, 0);
            assert!(loyalty_card::tier(&card) == 1, 0);
            assert!(loyalty_card::scan_count(&card) == 1, 0);
            scenario.return_to_sender(card);
        };
        scenario.end();
    }

    #[test]
    fun test_gold_tier() {
        let mut scenario = ts::begin(USER);
        {
            loyalty_card::mint_card(
                string::utf8(b"Tatenda"),
                scenario.ctx()
            );
        };
        scenario.next_tx(USER);
        {
            let mut card = scenario.take_from_sender<loyalty_card::LoyaltyCard>();
            loyalty_card::earn_points(&mut card, 500);
            assert!(loyalty_card::tier(&card) == 2, 0);
            scenario.return_to_sender(card);
        };
        scenario.end();
    }
}
