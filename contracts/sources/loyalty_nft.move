// Core module for SuiLoyalty Dynamic NFT lifecycle.
// Manages loyalty avatars as owned objects with composable attribute trees
// built from hierarchical Dynamic Fields and Dynamic Object Fields.
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

/// Admin capability for managing the loyalty platform.
/// Granted to the package publisher on module init.
public struct AdminCap has key, store {
    id: UID,
}

/// A consumer's loyalty avatar — the root of their attribute tree.
/// This is a shared object, allowing backend mutations via AdminCap.
public struct LoyaltyAvatar has key, store {
    id: UID,
    /// Display name for the avatar
    name: String,
    /// Overall loyalty level across all brands
    level: u64,
    /// Total experience points accumulated
    experience: u64,
    /// Whether the avatar is locked (e.g., during a mutation)
    locked: bool,
}

/// A brand node attached as a dynamic object field to a LoyaltyAvatar.
/// Represents the consumer's relationship with a specific brand.
///
/// `points` is the lifetime-earned counter (append-only — preserves the
/// "brands cannot silently reduce earned points" trust property).
/// `redeemed` is a separate cumulative counter for points spent.
/// The available balance is `points - redeemed`, computed off-chain or via
/// `brand_available()`. Both fields can only increase, so neither can be
/// silently reduced.
public struct BrandNode has key, store {
    id: UID,
    /// Brand identifier
    brand_name: String,
    /// Brand-specific loyalty tier (e.g., Bronze, Silver, Gold)
    tier: u64,
    /// Lifetime points earned with this brand (append-only)
    points: u64,
    /// Lifetime points redeemed against this brand (append-only)
    redeemed: u64,
}

/// Key type for looking up BrandNodes on a LoyaltyAvatar.
public struct BrandKey has copy, drop, store {
    brand_name: String,
}

/// Key type for looking up attributes on a BrandNode.
public struct AttributeKey has copy, drop, store {
    attribute_name: String,
}

/// Stores a single attribute value on a BrandNode via dynamic field.
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

/// Create a new loyalty avatar for the caller.
/// Returns the avatar so it can be used in PTBs before transfer.
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

/// Create a new avatar and share it.
entry fun mint_avatar(
    name: String,
    ctx: &mut TxContext,
) {
    let avatar = create_avatar(name, ctx);
    transfer::share_object(avatar);
}

/// Add a brand relationship to the avatar's attribute tree.
/// Creates a BrandNode as a dynamic object field on the avatar.
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

/// Remove a brand relationship from the avatar.
/// Deletes the BrandNode and all its attributes.
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

/// Add an attribute to a brand node (e.g., speed, endurance, style).
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

/// Update an existing attribute's value on a brand node.
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

/// Remove an attribute from a brand node.
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

/// Add experience points and potentially level up.
public fun gain_experience(
    _: &AdminCap,
    avatar: &mut LoyaltyAvatar,
    amount: u64,
) {
    assert!(!avatar.locked, EAvatarLocked);
    avatar.experience = avatar.experience + amount;
    // Level up every 1000 XP
    avatar.level = 1 + (avatar.experience / 1000);
}

/// Add points to a specific brand relationship.
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
    // Tier up every 500 points
    brand_node.tier = brand_node.points / 500;
}

/// Record a redemption against a brand's points.
/// Increments `redeemed` (append-only) and asserts that total redeemed
/// never exceeds total earned. The `points` field is left untouched —
/// "lifetime earned" remains immutable, in keeping with the project's
/// core trust property that brands cannot silently reduce earned points.
/// Available balance is `points - redeemed`.
public fun record_redemption(
    _: &AdminCap,
    avatar: &mut LoyaltyAvatar,
    brand_name: String,
    amount: u64,
) {
    assert!(!avatar.locked, EAvatarLocked);
    let brand_key = BrandKey { brand_name };
    assert!(dof::exists_(&avatar.id, brand_key), EBrandNotFound);

    let brand_node: &mut BrandNode = dof::borrow_mut(&mut avatar.id, brand_key);
    let available = brand_node.points - brand_node.redeemed;
    assert!(amount <= available, ERedemptionExceedsBalance);

    brand_node.redeemed = brand_node.redeemed + amount;

    event::emit(RedemptionRecordedEvent {
        avatar_id: object::id(avatar),
        brand_name: brand_key.brand_name,
        amount,
        new_redeemed_total: brand_node.redeemed,
    });
}

// === Admin Functions ===

/// Lock an avatar (e.g., during a sponsored mutation).
public fun lock_avatar(_: &AdminCap, avatar: &mut LoyaltyAvatar) {
    avatar.locked = true;
}

/// Unlock an avatar after mutation completes.
public fun unlock_avatar(_: &AdminCap, avatar: &mut LoyaltyAvatar) {
    avatar.locked = false;
}

// === View Functions ===

/// Get the avatar's name.
public fun name(avatar: &LoyaltyAvatar): String {
    avatar.name
}

/// Get the avatar's level.
public fun level(avatar: &LoyaltyAvatar): u64 {
    avatar.level
}

/// Get the avatar's total experience.
public fun experience(avatar: &LoyaltyAvatar): u64 {
    avatar.experience
}

/// Check if the avatar is locked.
public fun is_locked(avatar: &LoyaltyAvatar): bool {
    avatar.locked
}

/// Check if a brand exists on the avatar.
public fun has_brand(avatar: &LoyaltyAvatar, brand_name: String): bool {
    dof::exists_(&avatar.id, BrandKey { brand_name })
}

/// Get a brand node's tier.
public fun brand_tier(avatar: &LoyaltyAvatar, brand_name: String): u64 {
    let brand_key = BrandKey { brand_name };
    assert!(dof::exists_(&avatar.id, brand_key), EBrandNotFound);
    let brand_node: &BrandNode = dof::borrow(&avatar.id, brand_key);
    brand_node.tier
}

/// Get a brand node's points.
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

/// Get an attribute value from a brand node.
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

/// Get an attribute label from a brand node.
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

/// Check if an attribute exists on a brand node.
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
