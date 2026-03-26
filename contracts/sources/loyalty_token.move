module sui_loyalty::loyalty_token {
    use sui::coin::{Self, TreasuryCap};

    public struct LOYALTY_TOKEN has drop {}

    fun init(witness: LOYALTY_TOKEN, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            0,
            b"LPT",
            b"Loyalty Points",
            b"SuiLoyalty reward points",
            option::none(),
            ctx
        );
        transfer::public_transfer(treasury_cap, ctx.sender());
        transfer::public_share_object(metadata);
    }

    public fun mint(
        treasury_cap: &mut TreasuryCap<LOYALTY_TOKEN>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        coin::mint_and_transfer(treasury_cap, amount, recipient, ctx);
    }

    public fun burn(
        treasury_cap: &mut TreasuryCap<LOYALTY_TOKEN>,
        coin: coin::Coin<LOYALTY_TOKEN>
    ) {
        coin::burn(treasury_cap, coin);
    }
    
}