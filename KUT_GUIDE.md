# ShipMate Key User Testing (KUT) Guide

This guide provides a structured walkthrough for testing the end-to-end functionality of the ShipMate platform.

## 1. Authentication & Onboarding

### Test Case: Driver Registration & Verification
- [ ] **Action:** Sign up as a new user and select the **'Driver'** role.
- [ ] **Verify:** After sign-in, are you redirected to the "Personal Details" screen?
- [ ] **Action:** Complete Step 1 (Personal Info) and Step 2 (Upload ID/License).
- [ ] **Action:** Complete Step 3 (Vehicle Details) and Step 4 (4-sided vehicle photos).
- [ ] **Verify:** Upon submission, are you redirected to the "Home" screen?
- [ ] **Verify:** Is your status "Offline" by default?
- [ ] **Verify:** (Admin Check) Does the driver appear in the database as `verification_status = 'pending'`?

---

## 2. Order Lifecycle (The Happy Path)

### Test Case: Customer Order Creation
- [ ] **Action:** Sign up/Sign in as a **'Customer'**.
- [ ] **Action:** Tap "New Delivery" or "Errand".
- [ ] **Action:** Enter pickup/dropoff addresses and package description.
- [ ] **Action:** Tap "Create Order".
- [ ] **Verify:** Does the order appear in your "Active Orders" list?

### Test Case: Driver Job Acceptance
- [ ] **Action:** Sign in as an **Approved Driver** (set `verification_status = 'approved'` in DB).
- [ ] **Action:** Toggle "Online".
- [ ] **Action:** Go to "Available Jobs".
- [ ] **Action:** Find the customer's order and tap "Accept Job".
- [ ] **Verify:** Does the order move to your "Active Delivery" screen?

### Test Case: Real-time Tracking & Status Updates
- [ ] **Action:** On the Driver's Active Job screen, tap "Start En Route to Pickup".
- [ ] **Verify:** (Customer App) Does the status update to "Driver En Route"?
- [ ] **Action:** Progress through "Arrived at Pickup" -> "Package Collected" -> "En Route to Delivery".
- [ ] **Verify:** Does the Map update the driver's location marker in real-time?

---

## 3. Completion & Proof of Delivery

### Test Case: Delivering the Package
- [ ] **Action:** (Driver) Tap "Arrived at Delivery".
- [ ] **Action:** Tap "Complete Delivery".
- [ ] **Verify:** Does the "Proof of Delivery" modal open?
- [ ] **Action:** Capture a signature and a photo of the package.
- [ ] **Action:** Tap "Complete Delivery".
- [ ] **Verify:** (Driver) Is the job moved to history?
- [ ] **Verify:** (Customer) Is the order marked as "Delivered"?

---

## 4. Finance & Settings

### Test Case: Earnings Verification
- [ ] **Action:** (Driver) Go to the "Earnings" screen.
- [ ] **Verify:** Does the balance reflect the order amount minus the 13% platform fee?
- [ ] **Verify:** Is the "Completed Deliveries" count incremented?

### Test Case: Admin Configuration
- [ ] **Action:** Sign in as an **Admin** (set `role = 'admin'` in DB).
- [ ] **Action:** Go to the "Settings" tab.
- [ ] **Action:** Change `platform_commission_rate` from `13` to `20`.
- [ ] **Action:** Complete a new delivery.
- [ ] **Verify:** Does the new earnings calculation reflect the 20% commission?

---

## 5. Admin Oversight

### Test Case: Fleet Monitoring
- [ ] **Action:** (Admin) Go to the "Fleet" tab.
- [ ] **Verify:** Can you see all online drivers on the map?
- [ ] **Action:** Tap a driver marker to see their details.

### Test Case: Audit Logs
- [ ] **Action:** (Admin) Go to the "Orders" tab.
- [ ] **Verify:** Can you see the full history of all orders across the platform?
- [ ] **Verify:** Can you filter by status (e.g., "Pending", "Delivered")?
