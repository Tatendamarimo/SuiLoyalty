/// Fungible loyalty token module for SuiLoyalty.
/// Implements a single LOYALTY_TOKEN coin type with per-brand treasuries.
/// Merchants deposit tokens into their treasury and distribute them to
/// consumers on QR code redemption. Tokens are freely tradeable on-chain.
#[allow(deprecated_usage)]
module sui_loyalty::loyalty_token;

// Imports 

use std::string::String;
use sui::{
    coin::{Self, TreasuryCap},
    balance::{Self, Balance},
    event,
};

// Errors 

const EInsufficientTreasuryBalance: u64 = 100;
const EDistributorMismatch: u64 = 101;
const EZeroAmount: u64 = 102;

// OTW

/// One-Time Witness for creating the LOYALTY_TOKEN coin type.
public struct LOYALTY_TOKEN has drop {}

// Structs 

/// Platform-level admin capability. Created once in init.
/// The platform operator holds this to create treasuries and manage minting.
public struct TokenAdminCap has key, store {
    id: UID,
}

/// Per-brand treasury — a shared object holding the brand's token allocation.
/// The brand deposits tokens here; they are distributed to consumers on redemption.
public struct BrandTreasury has key {
    id: UID,
    /// Brand identifier (matches campaign brand_name)
    brand_name: String,
    /// The brand owner's address (for reference/analytics)
    brand_owner: address,
    /// Available token balance for distribution
    balance: Balance<LOYALTY_TOKEN>,
    /// Lifetime total tokens deposited into this treasury
    total_deposited: u64,
    /// Lifetime total tokens distributed to consumers
    total_distributed: u64,
}

/// Authorises a specific address (the sponsor/backend) to distribute
/// tokens from a specific BrandTreasury. Scoped to one treasury.
public struct DistributorCap has key, store {
    id: UID,
    /// The treasury this cap authorises withdrawals from
    treasury_id: ID,
}

// Events 

public struct TreasuryCreatedEvent has copy, drop {
    treasury_id: ID,
    brand_name: String,
    brand_owner: address,
}

public struct TokensMintedEvent has copy, drop {
    treasury_id: ID,
    amount: u64,
    new_balance: u64,
}

public struct TokensDistributedEvent has copy, drop {
    treasury_id: ID,
    recipient: address,
    amount: u64,
    remaining_balance: u64,
}

// Module Initializer

fun init(witness: LOYALTY_TOKEN, ctx: &mut TxContext) {
    // Create the LOYALTY_TOKEN currency (0 decimals — 1 token = 1 loyalty point)
    let (treasury_cap, metadata) = coin::create_currency(
        witness,
        0,                                          // decimals
        b"LOYAL",                                   // symbol
        b"Loyalty Point",                           // name
        b"SuiLoyalty on-chain loyalty points. Earned by scanning QR codes, tradeable on-chain.", // description
        option::none(),                             // icon_url
        ctx,
    );

    // Transfer TreasuryCap to publisher (platform admin controls minting)
    transfer::public_transfer(treasury_cap, ctx.sender());

    // Freeze metadata so it's publicly readable and immutable
    transfer::public_freeze_object(metadata);

    // Create and transfer the platform admin cap
    transfer::transfer(TokenAdminCap {
        id: object::new(ctx),
    }, ctx.sender());
}

// Treasury Management 

/// Create a new brand treasury. Only the platform admin can do this.
/// The treasury is created as a shared object so the backend sponsor can access it.
/// A DistributorCap is created and transferred to the caller (the admin/sponsor).
/// Create a new brand treasury. Only the platform admin can do this.
/// Returns a DistributorCap for this treasury (transfer it to the sponsor).
/// The treasury is shared so the backend sponsor can access it.
public fun create_brand_treasury(
    _cap: &TokenAdminCap,
    brand_name: String,
    brand_owner: address,
    ctx: &mut TxContext,
): DistributorCap {
    let treasury = BrandTreasury {
        id: object::new(ctx),
        brand_name,
        brand_owner,
        balance: balance::zero(),
        total_deposited: 0,
        total_distributed: 0,
    };

    let treasury_id = object::id(&treasury);

    // Create a distributor cap for this treasury
    let distributor = DistributorCap {
        id: object::new(ctx),
        treasury_id,
    };

    event::emit(TreasuryCreatedEvent {
        treasury_id,
        brand_name: treasury.brand_name,
        brand_owner,
    });

    // Share the treasury so sponsor can access it
    transfer::share_object(treasury);

    distributor
}

/// Mint new tokens and deposit them into a brand's treasury.
/// Only the holder of TreasuryCap (platform admin) can mint.
public fun mint_to_treasury(
    treasury_cap: &mut TreasuryCap<LOYALTY_TOKEN>,
    treasury: &mut BrandTreasury,
    amount: u64,
    ctx: &mut TxContext,
) {
    assert!(amount > 0, EZeroAmount);

    let minted = coin::mint(treasury_cap, amount, ctx);
    let minted_balance = coin::into_balance(minted);

    treasury.total_deposited = treasury.total_deposited + amount;
    balance::join(&mut treasury.balance, minted_balance);

    event::emit(TokensMintedEvent {
        treasury_id: object::id(treasury),
        amount,
        new_balance: balance::value(&treasury.balance),
    });
}

// Token Distribution

/// Distribute tokens from a brand treasury to a consumer.
/// Called by the backend sponsor using its DistributorCap.
/// The consumer receives a Coin<LOYALTY_TOKEN> in their wallet.
public fun distribute_tokens(
    distributor: &DistributorCap,
    treasury: &mut BrandTreasury,
    recipient: address,
    amount: u64,
    ctx: &mut TxContext,
) {
    assert!(amount > 0, EZeroAmount);
    assert!(distributor.treasury_id == object::id(treasury), EDistributorMismatch);
    assert!(balance::value(&treasury.balance) >= amount, EInsufficientTreasuryBalance);

    let coin_balance = balance::split(&mut treasury.balance, amount);
    let coin = coin::from_balance(coin_balance, ctx);

    treasury.total_distributed = treasury.total_distributed + amount;

    event::emit(TokensDistributedEvent {
        treasury_id: object::id(treasury),
        recipient,
        amount,
        remaining_balance: balance::value(&treasury.balance),
    });

    transfer::public_transfer(coin, recipient);
}

/// Admin function: withdraw tokens from a treasury back to a specific address.
/// Used for brand offboarding or rebalancing.
public fun withdraw_from_treasury(
    _cap: &TokenAdminCap,
    treasury: &mut BrandTreasury,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    assert!(amount > 0, EZeroAmount);
    assert!(balance::value(&treasury.balance) >= amount, EInsufficientTreasuryBalance);

    let coin_balance = balance::split(&mut treasury.balance, amount);
    let coin = coin::from_balance(coin_balance, ctx);

    transfer::public_transfer(coin, recipient);
}

// View Functions 

/// Get the brand name of a treasury.
public fun treasury_brand_name(treasury: &BrandTreasury): String {
    treasury.brand_name
}

/// Get the current available balance of a treasury.
public fun treasury_balance(treasury: &BrandTreasury): u64 {
    balance::value(&treasury.balance)
}

/// Get the total tokens ever deposited into a treasury.
public fun treasury_total_deposited(treasury: &BrandTreasury): u64 {
    treasury.total_deposited
}

/// Get the total tokens ever distributed from a treasury.
public fun treasury_total_distributed(treasury: &BrandTreasury): u64 {
    treasury.total_distributed
}

/// Get the brand owner address of a treasury.
public fun treasury_brand_owner(treasury: &BrandTreasury): address {
    treasury.brand_owner
}

/// Get the treasury ID that a distributor cap is authorised for.
public fun distributor_treasury_id(cap: &DistributorCap): ID {
    cap.treasury_id
}

// Test-Only Functions 

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(LOYALTY_TOKEN {}, ctx);
}

#[test_only]
public fun destroy_treasury_for_testing(treasury: BrandTreasury) {
    let BrandTreasury { id, brand_name: _, brand_owner: _, balance, total_deposited: _, total_distributed: _ } = treasury;
    balance::destroy_for_testing(balance);
    object::delete(id);
}

#[test_only]
public fun destroy_distributor_for_testing(cap: DistributorCap) {
    let DistributorCap { id, treasury_id: _ } = cap;
    object::delete(id);
}

#[test_only]
public fun destroy_admin_cap_for_testing(cap: TokenAdminCap) {
    let TokenAdminCap { id } = cap;
    object::delete(id);
}
