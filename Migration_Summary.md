# SuiLoyalty Architecture Migration Summary
**Date:** April 2026
**Author:** Tatenda Marimo

## Executive Summary
This document outlines the architectural migration of the SuiLoyalty platform from a basic, single-owner `LoyaltyCard` model to a scalable, highly secure **Shared Object + AdminCap** architecture, utilizing Dynamic NFT Avatars. 

The primary catalyst for this shift was the realization that in the Sui Object Model, the backend server cannot permissionlessly modify an object if it is explicitly "Owned" by the customer's wallet. To allow the backend to award points automatically while preserving a secure Web3 architecture, the system was moved to a Shared Object pattern secured by administrative capabilities.

---

## 1. Smart Contract Restructuring (`loyalty_nft.move`)
We deprecated the rigid `LoyaltyCard` struct and introduced the `LoyaltyAvatar` along with the `BrandNode` framework.

### Major Changes:
* **The Shared Object Pattern:** The `mint_avatar` function was rewritten to call `transfer::share_object(avatar)` instead of transferring ownership to the caller. This places the Avatar into global shared state, rendering it accessible by the backend server for point modifications.
* **The `AdminCap` Security Lock:** Since the avatar is shared, anyone could theoretically attempt to mutate it. To secure it, we introduced the `AdminCap` structural constraint. Every mutative function (such as `add_brand`, `add_brand_points`, `gain_experience`, `add_attribute`) now strictly requires `_: &AdminCap` as its first parameter. 
* **State Trees:** Brand relationships are no longer distinct cards; they are structured as Dynamic Object Fields (`BrandNode`) fundamentally attached to the parent `LoyaltyAvatar`. 

---

## 2. Backend Orchestration Updates
The Node.js/Express backend required deep modifications to successfully manage these new shared objects and provide the required security proofs.

### Major Changes:
* **`blockchain.service.ts`:**
  * Updated `mintAvatarOnChain` to call the shared `mint_avatar` entry function.
  * Injected `tx.object(process.env.ADMIN_CAP_ID)` into the Programmable Transaction Blocks (PTB) for `add_brand` and `add_brand_points`. This allows the backend to prove cryptographic authority over the shared object.
* **`qr.service.ts`:**
  * Entirely rewrote the `validateQRToken` workflow: 
    1. Look up if the user already possesses an Avatar.
    2. If not, mint the Avatar globally.
    3. Ensure a `BrandNode` exists for the specific merchant.
    4. Call `add_brand_points` utilizing the `AdminCap`.
* **Network Bounds (`server.ts`):** 
  * Reconfigured Express to listen on `0.0.0.0` (all network interfaces) instead of exclusively `localhost`.
  * Updated CORS to allow all local IPs to enable seamless connection from physical mobile devices scanning QR codes.

---

## 3. Database Schema Re-alignment
PostgreSQL needed to mirror the new hierarchical on-chain realities, shifting away from generic tables.

### Major Changes:
* **Dropped `loyalty_cards`:** This table was entirely truncated and dropped in favor of two new tracking layers.
* **Created `loyalty_avatars`:** Stores a 1:1 mapping of `user_id` to their unique `on_chain_avatar_id` on the Sui network.
* **Created `loyalty_brand_nodes`:** A many-to-one mapping storing individual branch states (points balance, scan counts, tiers) tied explicitly to a user and a brand.
* **Modified `point_transactions`:** Altered foreign keys to reference `loyalty_brand_nodes` rather than the old distinct cards.

---

## 4. Frontend & Testing Accessibility
To support real-world testing (scanning a QR code with a phone camera), the application boundaries had to be opened up.

### Major Changes:
* **`package.json`:** Modified the Next.js `dev` script to use `-H 0.0.0.0` so it accepts connections from external network devices.
* **`next.config.ts`:** Updated the `allowedDevOrigins` list explicitly to include the phone’s local IP Address (`192.168.1.48`), permitting internal Next.js proxies to function properly without encountering secure-host disconnects.
* **`dashboard/page.tsx`:** Hooked up fetching methods to display top-level aggregated Avatar data (Global Experience and Level) alongside the distinct brand balances.

---

## Conclusion
The SuiLoyalty platform now executes a flawless, mathematically sound Web3 lifecycle. It successfully provides a frictionless Web2 UX (immediate point gratification upon QR scan) powered entirely by highly-secured Web3 asset models under the hood.
