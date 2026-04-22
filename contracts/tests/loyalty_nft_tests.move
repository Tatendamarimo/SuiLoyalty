#[test_only]
module sui_loyalty::loyalty_nft_tests {
    use sui::test_scenario as ts;
    use sui_loyalty::loyalty_nft::{
        Self, AdminCap, LoyaltyAvatar,
    };
    use std::string;

    const ADMIN: address = @0xAD;
    const USER: address  = @0xB0;

    // ── helpers ────────────────────────────────────────────────────────────────

    /// Initialise the module and return a scenario positioned after the init tx.
    fun setup(): ts::Scenario {
        let mut scenario = ts::begin(ADMIN);
        { loyalty_nft::init_for_testing(scenario.ctx()); };
        scenario
    }

    // ── Avatar creation ────────────────────────────────────────────────────────

    #[test]
    fun test_create_avatar_defaults() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(
                string::utf8(b"Alice"),
                s.ctx(),
            );
            assert!(loyalty_nft::level(&avatar)      == 1,    0);
            assert!(loyalty_nft::experience(&avatar) == 0,    1);
            assert!(!loyalty_nft::is_locked(&avatar),         2);
            loyalty_nft::destroy_avatar_for_testing(avatar);
        };
        s.end();
    }

    #[test]
    fun test_mint_avatar_shares_object() {
        let mut s = setup();
        s.next_tx(USER);
        {
            // mint_avatar shares the object — just verify it doesn't abort
            loyalty_nft::mint_avatar(string::utf8(b"Bob"), s.ctx());
        };
        s.end();
    }

    // ── Brand management ───────────────────────────────────────────────────────

    #[test]
    fun test_add_brand_exists() {
        let mut s = setup();
        // create avatar
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Carol"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        // add brand as admin
        s.next_tx(ADMIN);
        {
            let cap   = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Nike"), s.ctx());
            assert!(loyalty_nft::has_brand(&avatar, string::utf8(b"Nike")), 0);
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test]
    fun test_add_multiple_brands() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Dave"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Nike"),  s.ctx());
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Adidas"), s.ctx());
            assert!(loyalty_nft::has_brand(&avatar, string::utf8(b"Nike")),   0);
            assert!(loyalty_nft::has_brand(&avatar, string::utf8(b"Adidas")), 1);
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test, expected_failure(abort_code = sui_loyalty::loyalty_nft::EBrandAlreadyExists)]
    fun test_add_duplicate_brand_fails() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Eve"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Nike"), s.ctx());
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Nike"), s.ctx()); // should abort
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test]
    fun test_remove_brand() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Frank"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Puma"), s.ctx());
            loyalty_nft::remove_brand(&cap, &mut avatar, string::utf8(b"Puma"));
            assert!(!loyalty_nft::has_brand(&avatar, string::utf8(b"Puma")), 0);
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test, expected_failure(abort_code = sui_loyalty::loyalty_nft::EBrandNotFound)]
    fun test_remove_nonexistent_brand_fails() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Gina"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::remove_brand(&cap, &mut avatar, string::utf8(b"Ghost")); // should abort
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    // ── Points & tier ──────────────────────────────────────────────────────────

    #[test]
    fun test_add_brand_points_bronze() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Henry"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Nike"), s.ctx());
            loyalty_nft::add_brand_points(&cap, &mut avatar, string::utf8(b"Nike"), 100);
            assert!(loyalty_nft::brand_points(&avatar, string::utf8(b"Nike")) == 100, 0);
            assert!(loyalty_nft::brand_tier(&avatar,  string::utf8(b"Nike")) == 0,   1); // tier = 100/500 = 0
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test]
    fun test_add_brand_points_tier_up() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Iris"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Adidas"), s.ctx());
            loyalty_nft::add_brand_points(&cap, &mut avatar, string::utf8(b"Adidas"), 500);
            assert!(loyalty_nft::brand_points(&avatar, string::utf8(b"Adidas")) == 500, 0);
            assert!(loyalty_nft::brand_tier(&avatar,  string::utf8(b"Adidas")) == 1,   1); // 500/500=1
            loyalty_nft::add_brand_points(&cap, &mut avatar, string::utf8(b"Adidas"), 500);
            assert!(loyalty_nft::brand_tier(&avatar, string::utf8(b"Adidas")) == 2, 2); // 1000/500=2
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test, expected_failure(abort_code = sui_loyalty::loyalty_nft::EBrandNotFound)]
    fun test_add_points_to_missing_brand_fails() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Jack"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::add_brand_points(&cap, &mut avatar, string::utf8(b"Ghost"), 50); // should abort
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    // ── Experience & level ─────────────────────────────────────────────────────

    #[test]
    fun test_gain_experience_no_level_up() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Kate"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::gain_experience(&cap, &mut avatar, 500);
            assert!(loyalty_nft::experience(&avatar) == 500, 0);
            assert!(loyalty_nft::level(&avatar)      == 1,   1); // 1 + 500/1000 = 1
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test]
    fun test_gain_experience_level_up() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Leo"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::gain_experience(&cap, &mut avatar, 1000);
            assert!(loyalty_nft::level(&avatar) == 2, 0); // 1 + 1000/1000 = 2
            loyalty_nft::gain_experience(&cap, &mut avatar, 2000);
            assert!(loyalty_nft::level(&avatar) == 4, 1); // 1 + 3000/1000 = 4
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    // ── Attributes ─────────────────────────────────────────────────────────────

    #[test]
    fun test_add_and_read_attribute() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Mia"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Nike"), s.ctx());
            loyalty_nft::add_attribute(
                &cap, &mut avatar,
                string::utf8(b"Nike"),
                string::utf8(b"speed"),
                75,
                string::utf8(b"Speed Rating"),
            );
            assert!(loyalty_nft::has_attribute(&avatar, string::utf8(b"Nike"), string::utf8(b"speed")), 0);
            assert!(loyalty_nft::attribute_value(&avatar, string::utf8(b"Nike"), string::utf8(b"speed")) == 75, 1);
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test]
    fun test_update_attribute() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Noah"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Reebok"), s.ctx());
            loyalty_nft::add_attribute(
                &cap, &mut avatar,
                string::utf8(b"Reebok"),
                string::utf8(b"endurance"),
                30,
                string::utf8(b"Endurance"),
            );
            loyalty_nft::update_attribute(
                &cap, &mut avatar,
                string::utf8(b"Reebok"),
                string::utf8(b"endurance"),
                95,
            );
            assert!(loyalty_nft::attribute_value(&avatar, string::utf8(b"Reebok"), string::utf8(b"endurance")) == 95, 0);
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test]
    fun test_remove_attribute() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Olivia"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"UA"), s.ctx());
            loyalty_nft::add_attribute(
                &cap, &mut avatar,
                string::utf8(b"UA"),
                string::utf8(b"style"),
                50,
                string::utf8(b"Style"),
            );
            loyalty_nft::remove_attribute(
                &cap, &mut avatar,
                string::utf8(b"UA"),
                string::utf8(b"style"),
            );
            assert!(!loyalty_nft::has_attribute(&avatar, string::utf8(b"UA"), string::utf8(b"style")), 0);
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test, expected_failure(abort_code = sui_loyalty::loyalty_nft::EAttributeAlreadyExists)]
    fun test_add_duplicate_attribute_fails() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Pat"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Nike"), s.ctx());
            loyalty_nft::add_attribute(&cap, &mut avatar, string::utf8(b"Nike"), string::utf8(b"speed"), 10, string::utf8(b"Speed"));
            loyalty_nft::add_attribute(&cap, &mut avatar, string::utf8(b"Nike"), string::utf8(b"speed"), 20, string::utf8(b"Speed")); // abort
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test, expected_failure(abort_code = sui_loyalty::loyalty_nft::EAttributeNotFound)]
    fun test_update_missing_attribute_fails() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Quinn"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Nike"), s.ctx());
            loyalty_nft::update_attribute(&cap, &mut avatar, string::utf8(b"Nike"), string::utf8(b"ghost"), 99); // abort
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    // ── Lock / unlock ──────────────────────────────────────────────────────────

    #[test]
    fun test_lock_and_unlock() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Rita"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::lock_avatar(&cap, &mut avatar);
            assert!(loyalty_nft::is_locked(&avatar), 0);
            loyalty_nft::unlock_avatar(&cap, &mut avatar);
            assert!(!loyalty_nft::is_locked(&avatar), 1);
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test, expected_failure(abort_code = sui_loyalty::loyalty_nft::EAvatarLocked)]
    fun test_add_brand_while_locked_fails() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Sam"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::lock_avatar(&cap, &mut avatar);
            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Nike"), s.ctx()); // abort
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    #[test, expected_failure(abort_code = sui_loyalty::loyalty_nft::EAvatarLocked)]
    fun test_gain_experience_while_locked_fails() {
        let mut s = setup();
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Tina"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);
            loyalty_nft::lock_avatar(&cap, &mut avatar);
            loyalty_nft::gain_experience(&cap, &mut avatar, 100); // abort
            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }

    // ── Full lifecycle ─────────────────────────────────────────────────────────

    #[test]
    fun test_full_lifecycle() {
        let mut s = setup();
        // 1. Create avatar
        s.next_tx(USER);
        {
            let avatar = loyalty_nft::create_avatar(string::utf8(b"Vera"), s.ctx());
            transfer::public_transfer(avatar, USER);
        };
        // 2. Add brand, points, attributes, XP
        s.next_tx(ADMIN);
        {
            let cap        = s.take_from_sender<AdminCap>();
            let mut avatar = s.take_from_address<LoyaltyAvatar>(USER);

            loyalty_nft::add_brand(&cap, &mut avatar, string::utf8(b"Nike"), s.ctx());
            loyalty_nft::add_brand_points(&cap, &mut avatar, string::utf8(b"Nike"), 500);
            loyalty_nft::add_attribute(
                &cap, &mut avatar,
                string::utf8(b"Nike"),
                string::utf8(b"speed"), 80, string::utf8(b"Speed"),
            );
            loyalty_nft::gain_experience(&cap, &mut avatar, 1000);

            assert!(loyalty_nft::brand_tier(&avatar, string::utf8(b"Nike"))   == 1, 0);
            assert!(loyalty_nft::brand_points(&avatar, string::utf8(b"Nike")) == 500, 1);
            assert!(loyalty_nft::level(&avatar)                               == 2, 2);

            // 3. Lock → cannot mutate
            loyalty_nft::lock_avatar(&cap, &mut avatar);
            loyalty_nft::unlock_avatar(&cap, &mut avatar);

            // 4. Remove brand
            loyalty_nft::remove_brand(&cap, &mut avatar, string::utf8(b"Nike"));
            assert!(!loyalty_nft::has_brand(&avatar, string::utf8(b"Nike")), 3);

            s.return_to_sender(cap);
            transfer::public_transfer(avatar, USER);
        };
        s.end();
    }
}
