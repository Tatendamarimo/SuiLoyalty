module sui_loyalty::loyalty_card {
    use sui::event;
    use std::string::String;

    const ECardLocked: u64 = 1;
    const EInvalidPoints: u64 = 2;

    public struct LoyaltyCard has key, store {
        id: UID,
        owner_name: String,
        points: u64,
        tier: u64,
        scan_count: u64,
        locked: bool,
    }

    public struct PointsEarned has copy, drop {
        card_id: ID,
        points_added: u64,
        new_total: u64,
        new_tier: u64,
    }

    public struct CardCreated has copy, drop {
        card_id: ID,
        owner_name: String,
    }

    public fun create_card(
        owner_name: String,
        ctx: &mut TxContext
    ): LoyaltyCard {
        let card = LoyaltyCard {
            id: object::new(ctx),
            owner_name,
            points: 0,
            tier: 0,
            scan_count: 0,
            locked: false,
        };
        event::emit(CardCreated {
            card_id: object::id(&card),
            owner_name: card.owner_name,
        });
        card
    }

    entry fun mint_card(
        owner_name: String,
        ctx: &mut TxContext
    ) {
        let card = create_card(owner_name, ctx);
        transfer::transfer(card, ctx.sender());
    }

    public fun earn_points(
        card: &mut LoyaltyCard,
        points_to_add: u64,
    ) {
        assert!(!card.locked, ECardLocked);
        assert!(points_to_add > 0, EInvalidPoints);
        card.points = card.points + points_to_add;
        card.scan_count = card.scan_count + 1;
        card.tier = if (card.points >= 500) { 2 }
                    else if (card.points >= 100) { 1 }
                    else { 0 };
        event::emit(PointsEarned {
            card_id: object::id(card),
            points_added: points_to_add,
            new_total: card.points,
            new_tier: card.tier,
        });
    }

    public fun points(card: &LoyaltyCard): u64 { card.points }
    public fun tier(card: &LoyaltyCard): u64 { card.tier }
    public fun scan_count(card: &LoyaltyCard): u64 { card.scan_count }
    public fun is_locked(card: &LoyaltyCard): bool { card.locked }
    public fun owner_name(card: &LoyaltyCard): String { card.owner_name }
}
