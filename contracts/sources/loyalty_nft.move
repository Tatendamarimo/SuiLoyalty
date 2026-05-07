// Core module for SuiLoyalty Dynamic NFT lifecycle.
// Implements a composable on-chain attribute tree using Dynamic Fields (DF)
// and Dynamic Object Fields (DOF) for constant-time O(1) attribute lookups.
module sui_loyalty::loyalty_nft;

// === Imports ===

use std::string::String;
use sui::{
    event,
    dynamic_field as df,
    dynamic_object_field as dof,
};

// === Errors ===

const EBrandAlreadyExists: u64 = 1;
const EBrandNotFound: u64 = 2;
const EAttributeAlreadyExists: u64 = 3;
const EAttributeNotFound: u64 = 4;
const EAvatarLocked: u64 = 5;
const ERedemptionExceedsBalance: u64 = 6;

// === Structs ===

public struct AdminCap has key, store {
    id: UID,
}

// Main root object representing the consumer's on-chain identity
public struct LoyaltyAvatar has key, store {
    id: UID,
    name: String,
    level: u64,
    experience: u64,
    locked: bool,
}

// Brand nodes attached to the avatar via Dynamic Object Fields (DOF).
// Uses separate append-only counters for 'points' and 'redeemed' to preserve historical state auditability,
// ensuring that points can never be silently decremented on-chain (immutable ledger design).
public struct BrandNode has key, store {
    id: UID,
    brand_name: String,
    tier: u64,
    points: u64,
    redeemed: u64,
}

public struct BrandKey has copy, drop, store {
    brand_name: String,
}

public struct AttributeKey has copy, drop, store {
    attribute_name: String,
}

public struct AttributeValue has copy, drop, store {
    value: u64,
    label: String,
}

// === Events ===

public struct AvatarCreatedEvent has copy, drop {
    avatar_id: ID,
    owner: address,
    name: String,
}

public struct BrandAddedEvent has copy, drop {
    avatar_id: ID,
    brand_name: String,
}

public struct BrandRemovedEvent has copy, drop {
    avatar_id: ID,
    brand_name: String,
}

public struct AttributeUpdatedEvent has copy, drop {
    avatar_id: ID,
    brand_name: String,
    attribute_name: String,
    new_value: u64,
}

public struct AttributeRemovedEvent has copy, drop {
    avatar_id: ID,
    brand_name: String,
    attribute_name: String,
}

public struct RedemptionRecordedEvent has copy, drop {
    avatar_id: ID,
    brand_name: String,
    amount: u64,
    new_redeemed_total: u64,
}

// === Module Initializer ===

fun init(ctx: &mut TxContext) {
    transfer::transfer(AdminCap {
        id: object::new(ctx),
    }, ctx.sender());
}

// === Public Functions ===

public fun create_avatar(
    name: String,
    ctx: &mut TxContext,
): LoyaltyAvatar {
    let avatar = LoyaltyAvatar {
        id: object::new(ctx),
        name,
        level: 1,
        experience: 0,
        locked: false,
    };

    event::emit(AvatarCreatedEvent {
        avatar_id: object::id(&avatar),
        owner: ctx.sender(),
        name: avatar.name,
    });

    avatar
}

entry fun mint_avatar(
    name: String,
    ctx: &mut TxContext,
) {
    let avatar = create_avatar(name, ctx);
    transfer::share_object(avatar);
}

// Attaches a BrandNode dynamically to avoid O(N) array search overhead
public fun add_brand(
    _: &AdminCap,
    avatar: &mut LoyaltyAvatar,
    brand_name: String,
    ctx: &mut TxContext,
) {
    assert!(!avatar.locked, EAvatarLocked);
    let key = BrandKey { brand_name };
    assert!(!dof::exists_(&avatar.id, key), EBrandAlreadyExists);

    let brand_node = BrandNode {
        id: object::new(ctx),
        brand_name: key.brand_name,
        tier: 0,
        points: 0,
        redeemed: 0,
    };

    event::emit(BrandAddedEvent {
        avatar_id: object::id(avatar),
        brand_name: key.brand_name,
    });

    dof::add(&mut avatar.id, key, brand_node);
}

// Deletes the BrandNode and deallocates its memory dynamically
public fun remove_brand(
    _: &AdminCap,
    avatar: &mut LoyaltyAvatar,
    brand_name: String,
) {
    assert!(!avatar.locked, EAvatarLocked);
    let key = BrandKey { brand_name };
    assert!(dof::exists_(&avatar.id, key), EBrandNotFound);

    let brand_node: BrandNode = dof::remove(&mut avatar.id, key);

    event::emit(BrandRemovedEvent {
        avatar_id: object::id(avatar),
        brand_name: key.brand_name,
    });

    let BrandNode { id, brand_name: _, tier: _, points: _, redeemed: _ } = brand_node;
    object::delete(id);
}

// Extends the brand node dynamically with custom attribute sub-fields
public fun add_attribute(
    _: &AdminCap,
    avatar: &mut LoyaltyAvatar,
    brand_name: String,
    attribute_name: String,
    value: u64,
    label: String,
) {
    assert!(!avatar.locked, EAvatarLocked);
    let brand_key = BrandKey { brand_name };
    assert!(dof::exists_(&avatar.id, brand_key), EBrandNotFound);

    let brand_node: &mut BrandNode = dof::borrow_mut(&mut avatar.id, brand_key);
    let attr_key = AttributeKey { attribute_name };
    assert!(!df::exists_(&brand_node.id, attr_key), EAttributeAlreadyExists);

    df::add(&mut brand_node.id, attr_key, AttributeValue { value, label });

    event::emit(AttributeUpdatedEvent {
        avatar_id: object::id(avatar),
        brand_name: brand_key.brand_name,
        attribute_name: attr_key.attribute_name,
        new_value: value,
    });
}

public fun update_attribute(
    _: &AdminCap,
    avatar: &mut LoyaltyAvatar,
    brand_name: String,
    attribute_name: String,
    new_value: u64,
) {
    assert!(!avatar.locked, EAvatarLocked);
    let brand_key = BrandKey { brand_name };
    assert!(dof::exists_(&avatar.id, brand_key), EBrandNotFound);

    let brand_node: &mut BrandNode = dof::borrow_mut(&mut avatar.id, brand_key);
    let attr_key = AttributeKey { attribute_name };
    assert!(df::exists_(&brand_node.id, attr_key), EAttributeNotFound);

    let attr: &mut AttributeValue = df::borrow_mut(&mut brand_node.id, attr_key);
    attr.value = new_value;

    event::emit(AttributeUpdatedEvent {
        avatar_id: object::id(avatar),
        brand_name: brand_key.brand_name,
        attribute_name: attr_key.attribute_name,
        new_value,
    });
}

public fun remove_attribute(
    _: &AdminCap,
    avatar: &mut LoyaltyAvatar,
    brand_name: String,
    attribute_name: String,
) {
    assert!(!avatar.locked, EAvatarLocked);
    let brand_key = BrandKey { brand_name };
    assert!(dof::exists_(&avatar.id, brand_key), EBrandNotFound);

    let brand_node: &mut BrandNode = dof::borrow_mut(&mut avatar.id, brand_key);
    let attr_key = AttributeKey { attribute_name };
    assert!(df::exists_(&brand_node.id, attr_key), EAttributeNotFound);

    let _removed: AttributeValue = df::remove(&mut brand_node.id, attr_key);

    event::emit(AttributeRemovedEvent {
        avatar_id: object::id(avatar),
        brand_name: brand_key.brand_name,
        attribute_name: attr_key.attribute_name,
    });
}

// Experience accumulation with O(1) state mutation
public fun gain_experience(
    _: &AdminCap,
    avatar: &mut LoyaltyAvatar,
    amount: u64,
) {
    assert!(!avatar.locked, EAvatarLocked);
    avatar.experience = avatar.experience + amount;
    avatar.level = 1 + (avatar.experience / 1000);
}

// Award points to a specific brand node (tier transitions modeled mathematically)
public fun add_brand_points(
    _: &AdminCap,
    avatar: &mut LoyaltyAvatar,
    brand_name: String,
    points: u64,
) {
    assert!(!avatar.locked, EAvatarLocked);
    let brand_key = BrandKey { brand_name };
    assert!(dof::exists_(&avatar.id, brand_key), EBrandNotFound);

    let brand_node: &mut BrandNode = dof::borrow_mut(&mut avatar.id, brand_key);
    brand_node.points = brand_node.points + points;
    brand_node.tier = brand_node.points / 500;
}

// Records a redemption event, verifying available balance before updating spent counter
public fun record_redemption(
    _: &AdminCap,
    avatar: &mut LoyaltyAvatar,
    brand_name: String,
    amount: u64,
) {
    assert!(!avatar.locked, EAvatarLocked);
    let brand_key = BrandKey { brand_name };
    assert!(dof::exists_(&avatar.id, brand_key), EBrandNotFound);

    // Copy avatar ID first to satisfy the Move borrow checker's single-mutable-reference invariant
    let avatar_id = object::id(avatar);

    let new_redeemed_total = {
        let brand_node: &mut BrandNode = dof::borrow_mut(&mut avatar.id, brand_key);
        let available = brand_node.points - brand_node.redeemed;
        assert!(amount <= available, ERedemptionExceedsBalance);
        brand_node.redeemed = brand_node.redeemed + amount;
        brand_node.redeemed
    };

    event::emit(RedemptionRecordedEvent {
        avatar_id,
        brand_name: brand_key.brand_name,
        amount,
        new_redeemed_total,
    });
}

// === Admin Functions ===

public fun lock_avatar(_: &AdminCap, avatar: &mut LoyaltyAvatar) {
    avatar.locked = true;
}

// Unlock an avatar after mutation completes
public fun unlock_avatar(_: &AdminCap, avatar: &mut LoyaltyAvatar) {
    avatar.locked = false;
}

// === View Functions ===

public fun name(avatar: &LoyaltyAvatar): String {
    avatar.name
}

public fun level(avatar: &LoyaltyAvatar): u64 {
    avatar.level
}

public fun experience(avatar: &LoyaltyAvatar): u64 {
    avatar.experience
}

public fun is_locked(avatar: &LoyaltyAvatar): bool {
    avatar.locked
}

public fun has_brand(avatar: &LoyaltyAvatar, brand_name: String): bool {
    dof::exists_(&avatar.id, BrandKey { brand_name })
}

public fun brand_tier(avatar: &LoyaltyAvatar, brand_name: String): u64 {
    let brand_key = BrandKey { brand_name };
    assert!(dof::exists_(&avatar.id, brand_key), EBrandNotFound);
    let brand_node: &BrandNode = dof::borrow(&avatar.id, brand_key);
    brand_node.tier
}

public fun brand_redeemed(avatar: &LoyaltyAvatar, brand_name: String): u64 {
    let key = BrandKey { brand_name };
    if (!dof::exists_(&avatar.id, key)) return 0;
    let node: &BrandNode = dof::borrow(&avatar.id, key);
    node.redeemed
}

public fun brand_available(avatar: &LoyaltyAvatar, brand_name: String): u64 {
    let key = BrandKey { brand_name };
    if (!dof::exists_(&avatar.id, key)) return 0;
    let node: &BrandNode = dof::borrow(&avatar.id, key);
    node.points - node.redeemed
}

public fun brand_points(avatar: &LoyaltyAvatar, brand_name: String): u64 {
    let brand_key = BrandKey { brand_name };
    assert!(dof::exists_(&avatar.id, brand_key), EBrandNotFound);
    let brand_node: &BrandNode = dof::borrow(&avatar.id, brand_key);
    brand_node.points
}

public fun attribute_value(
    avatar: &LoyaltyAvatar,
    brand_name: String,
    attribute_name: String,
): u64 {
    let brand_key = BrandKey { brand_name };
    assert!(dof::exists_(&avatar.id, brand_key), EBrandNotFound);
    let brand_node: &BrandNode = dof::borrow(&avatar.id, brand_key);
    let attr_key = AttributeKey { attribute_name };
    assert!(df::exists_(&brand_node.id, attr_key), EAttributeNotFound);
    let attr: &AttributeValue = df::borrow(&brand_node.id, attr_key);
    attr.value
}

public fun attribute_label(
    avatar: &LoyaltyAvatar,
    brand_name: String,
    attribute_name: String,
): String {
    let brand_key = BrandKey { brand_name };
    assert!(dof::exists_(&avatar.id, brand_key), EBrandNotFound);
    let brand_node: &BrandNode = dof::borrow(&avatar.id, brand_key);
    let attr_key = AttributeKey { attribute_name };
    assert!(df::exists_(&brand_node.id, attr_key), EAttributeNotFound);
    let attr: &AttributeValue = df::borrow(&brand_node.id, attr_key);
    attr.label
}

public fun has_attribute(
    avatar: &LoyaltyAvatar,
    brand_name: String,
    attribute_name: String,
): bool {
    let brand_key = BrandKey { brand_name };
    if (!dof::exists_(&avatar.id, brand_key)) return false;
    let brand_node: &BrandNode = dof::borrow(&avatar.id, brand_key);
    df::exists_(&brand_node.id, AttributeKey { attribute_name })
}

// === Test-Only Functions ===

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}

#[test_only]
public fun destroy_avatar_for_testing(avatar: LoyaltyAvatar) {
    let LoyaltyAvatar { id, name: _, level: _, experience: _, locked: _ } = avatar;
    object::delete(id);
}
