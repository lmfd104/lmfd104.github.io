/* Platform billing adapter — RevenueCat via @revenuecat/purchases-capacitor
 * on native (iOS/Android Capacitor builds). On the plain web build the store
 * is unavailable, so GH.shop falls back to its clearly-labeled dev unlock.
 *
 * Interface (see docs/billing.md):
 *   GH.billing.available()         -> boolean  (native store usable right now)
 *   GH.billing.purchase(productId) -> Promise<{ ok, restored?, error? }>
 *   GH.billing.restore()           -> Promise<{ ok, restored?: string[], error? }>
 *                                     `restored` lists store product ids whose
 *                                     entitlements are active for this user.
 *
 * Config: window.GH_BILLING_CONFIG = { apiKey } (or { apiKeyIos, apiKeyAndroid })
 * is injected at Capacitor build time — never committed. RevenueCat entitlement
 * id: "painted_legends".
 */
window.GH = window.GH || {};

GH.billing = (function () {
  // RevenueCat entitlement id -> store product ids that unlock it.
  const ENTITLEMENTS = {
    painted_legends: ['guildhall_pack_painted'],
    guild_charter: ['guildhall_charter'],
    guild_wardrobe: ['guildhall_pack_themes'],
  };
  const PRODUCT_TO_ENTITLEMENT = {};
  for (const ent of Object.keys(ENTITLEMENTS)) {
    for (const pid of ENTITLEMENTS[ent]) PRODUCT_TO_ENTITLEMENT[pid] = ent;
  }

  let configuring = null; // one-shot configure() promise

  // The Capacitor bridge exposes registered native plugins on Capacitor.Plugins;
  // for this no-bundler app that's how @revenuecat/purchases-capacitor appears.
  function plugin() {
    try {
      const cap = window.Capacitor;
      if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
      return (cap.Plugins && cap.Plugins.Purchases) || null;
    } catch (e) { return null; }
  }

  function available() { return !!plugin(); }

  function apiKey() {
    const cfg = window.GH_BILLING_CONFIG || {};
    if (cfg.apiKey) return cfg.apiKey;
    try {
      const plat = window.Capacitor.getPlatform();
      if (plat === 'ios') return cfg.apiKeyIos || null;
      if (plat === 'android') return cfg.apiKeyAndroid || null;
    } catch (e) {}
    return null;
  }

  function ensureConfigured() {
    if (configuring) return configuring;
    const rc = plugin();
    if (!rc) return Promise.reject(new Error('billing_unavailable'));
    const key = apiKey();
    if (!key) return Promise.reject(new Error('missing_api_key (window.GH_BILLING_CONFIG)'));
    configuring = Promise.resolve(rc.configure({ apiKey: key }))
      .then(() => rc)
      .catch((e) => { configuring = null; throw e; });
    return configuring;
  }

  // Store product ids covered by the currently-active entitlements.
  function activeProductIds(customerInfo) {
    const out = [];
    const active = customerInfo && customerInfo.entitlements && customerInfo.entitlements.active;
    if (!active) return out;
    for (const ent of Object.keys(ENTITLEMENTS)) {
      if (active[ent]) out.push.apply(out, ENTITLEMENTS[ent]);
    }
    return out;
  }

  function isCancel(e) {
    if (!e) return false;
    if (e.userCancelled === true) return true;
    return /cancell?ed/i.test(String(e.code || '') + ' ' + String(e.message || e));
  }

  function errMsg(e) { return String((e && e.message) || e); }

  async function purchase(productId) {
    try {
      const rc = await ensureConfigured();
      if (!PRODUCT_TO_ENTITLEMENT[productId]) return { ok: false, error: 'unknown_product:' + productId };

      // Already entitled (re-install / same store account)? Report as restored,
      // don't charge again.
      try {
        const infoRes = await rc.getCustomerInfo();
        const info = (infoRes && infoRes.customerInfo) || infoRes;
        if (activeProductIds(info).indexOf(productId) !== -1) return { ok: true, restored: true };
      } catch (e) { /* non-fatal — proceed to purchase */ }

      const prodRes = await rc.getProducts({ productIdentifiers: [productId] });
      const product = prodRes && prodRes.products && prodRes.products[0];
      if (!product) return { ok: false, error: 'product_not_found:' + productId };

      // Rejects on failure/cancel; resolving means the store transaction went through.
      await rc.purchaseStoreProduct({ product });
      return { ok: true };
    } catch (e) {
      if (isCancel(e)) return { ok: false, error: 'cancelled' };
      return { ok: false, error: errMsg(e) };
    }
  }

  async function restore() {
    try {
      const rc = await ensureConfigured();
      const res = await rc.restorePurchases();
      const info = (res && res.customerInfo) || res;
      return { ok: true, restored: activeProductIds(info) };
    } catch (e) {
      if (isCancel(e)) return { ok: false, error: 'cancelled', restored: [] };
      return { ok: false, error: errMsg(e), restored: [] };
    }
  }

  // ENTITLEMENTS is exported so the engine ports can ship the same map without
  // retyping it. The adapter itself is NOT portable — each engine has its own
  // billing SDK — but which product ids unlock which entitlement is a contract
  // shared with the store account, and a port that gets it wrong silently fails
  // to restore a real purchase.
  return { available, purchase, restore, ENTITLEMENTS };
})();
