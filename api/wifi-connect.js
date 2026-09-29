module.exports = async function handler(req, res) {
  // ============================================================
  // YouthLink / SK Free-WiFi Nagsimbaanan
  // Omada External Portal Authorization API
  // ============================================================

  res.setHeader("Cache-Control", "no-store");

  // POST requests only
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    // ============================================================
    // 1. LOAD VERCEL ENVIRONMENT VARIABLES
    // ============================================================

    const controllerUrl = String(
      process.env.OMADA_CONTROLLER_URL || ""
    )
      .replace(/\/+$/, "")
      .trim();

    const controllerId = String(
      process.env.OMADA_CONTROLLER_ID || ""
    ).trim();

    const username = String(
      process.env.OMADA_OPERATOR_USERNAME || ""
    ).trim();

    const password = String(
      process.env.OMADA_OPERATOR_PASSWORD || ""
    );

    if (!controllerUrl || !controllerId || !username || !password) {
      return res.status(500).json({
        ok: false,
        error: "Missing Omada environment variables.",
        required: [
          "OMADA_CONTROLLER_URL",
          "OMADA_CONTROLLER_ID",
          "OMADA_OPERATOR_USERNAME",
          "OMADA_OPERATOR_PASSWORD",
        ],
      });
    }

    // ============================================================
    // 2. READ CLIENT INFORMATION FROM PORTAL
    // ============================================================

    let body = {};

    if (typeof req.body === "string") {
      try {
        body = JSON.parse(req.body || "{}");
      } catch {
        body = {};
      }
    } else {
      body = req.body || {};
    }

    const clientMac = String(body.clientMac || "").trim();
    const clientIp = String(body.clientIp || "").trim();
    const apMac = String(body.apMac || "").trim();
    const ssidName = String(body.ssidName || "").trim();
    const radioId = String(body.radioId ?? "").trim();
    const site = String(body.site || "").trim();

    const originUrl = String(
      body.originUrl ||
      body.redirectUrl ||
      ""
    ).trim();

    // Omada EAP External Portal requires these values.
    if (
      !clientMac ||
      !apMac ||
      !ssidName ||
      radioId === "" ||
      !site
    ) {
      return res.status(400).json({
        ok: false,
        error: "Missing Omada client information.",
        received: {
          clientMac: Boolean(clientMac),
          clientIp: Boolean(clientIp),
          apMac: Boolean(apMac),
          ssidName: Boolean(ssidName),
          radioId: radioId !== "",
          site: Boolean(site),
        },
      });
    }

    // ============================================================
    // 3. LOGIN TO OMADA USING HOTSPOT OPERATOR ACCOUNT
    // ============================================================

    const loginUrl =
      `${controllerUrl}/${encodeURIComponent(controllerId)}` +
      `/api/v2/hotspot/login`;

    const loginResponse = await fetch(loginUrl, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },

      body: JSON.stringify({
        name: username,
        password: password,
      }),
    });

    const loginText = await loginResponse.text();

    let loginData;

    try {
      loginData = JSON.parse(loginText);
    } catch {
      return res.status(502).json({
        ok: false,
        error: "Omada returned an invalid login response.",
        status: loginResponse.status,
        response: loginText.slice(0, 500),
      });
    }

    if (
      !loginResponse.ok ||
      Number(loginData.errorCode) !== 0
    ) {
      return res.status(502).json({
        ok: false,
        error: "Omada Hotspot Operator login failed.",
        status: loginResponse.status,
        omada: loginData,
      });
    }

    // ============================================================
    // 4. GET CSRF TOKEN
    // ============================================================

    const csrfToken =
      loginData?.result?.token ||
      loginData?.value ||
      "";

    if (!csrfToken) {
      return res.status(502).json({
        ok: false,
        error: "Omada login succeeded but no CSRF token was returned.",
      });
    }

    // ============================================================
    // 5. GET OMADA SESSION COOKIE
    // ============================================================

    let sessionCookie = "";

    // Modern Node/Vercel fetch implementation
    if (
      loginResponse.headers &&
      typeof loginResponse.headers.getSetCookie === "function"
    ) {
      const cookies = loginResponse.headers.getSetCookie();

      sessionCookie = cookies
        .map((cookie) => cookie.split(";")[0])
        .join("; ");
    } else {
      // Fallback
      const rawCookie =
        loginResponse.headers.get("set-cookie") || "";

      if (rawCookie) {
        sessionCookie = rawCookie
          .split(/,(?=[^;,]+=)/)
          .map((cookie) => cookie.split(";")[0])
          .join("; ");
      }
    }

    if (!sessionCookie) {
      return res.status(502).json({
        ok: false,
        error:
          "Omada login succeeded but no session cookie was returned.",
      });
    }

    // ============================================================
    // 6. BUILD OMADA AUTHORIZATION URL
    // ============================================================

    const authUrl =
      `${controllerUrl}/${encodeURIComponent(controllerId)}` +
      `/api/v2/hotspot/extPortal/auth` +
      `?token=${encodeURIComponent(csrfToken)}`;

    // ============================================================
    // 7. AUTHORIZATION TIME
    // ============================================================

    // TP-Link External Portal API specifies microseconds.
    // 8 hours = 28,800 seconds
    // 28,800 × 1,000,000 = 28,800,000,000 microseconds
    const authTime = 8 * 60 * 60 * 1000 * 1000;

    // ============================================================
    // 8. BUILD EAP AUTHORIZATION PAYLOAD
    // ============================================================

    const authPayload = {
      clientMac: clientMac,
      apMac: apMac,
      ssidName: ssidName,
      radioId: Number(radioId),
      site: site,
      time: authTime,
      authType: 4,
    };

    // ============================================================
    // 9. SEND AUTHORIZATION REQUEST TO OMADA
    // ============================================================

    const authResponse = await fetch(authUrl, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",

        // Omada CSRF protection
        "Csrf-Token": csrfToken,

        // Omada requires the login session cookie
        Cookie: sessionCookie,
      },

      body: JSON.stringify(authPayload),
    });

    const authText = await authResponse.text();

    let authData;

    try {
      authData = authText
        ? JSON.parse(authText)
        : {};
    } catch {
      return res.status(502).json({
        ok: false,
        error: "Omada returned an invalid authorization response.",
        status: authResponse.status,
        response: authText.slice(0, 500),
      });
    }

    // ============================================================
    // 10. CHECK OMADA RESULT
    // ============================================================

    if (
      !authResponse.ok ||
      Number(authData.errorCode) !== 0
    ) {
      return res.status(502).json({
        ok: false,
        error: "Omada client authorization failed.",
        status: authResponse.status,
        omada: authData,
      });
    }

    // ============================================================
    // 11. SUCCESS
    // ============================================================

    return res.status(200).json({
      ok: true,
      message: "Wi-Fi client authorized successfully.",
      redirectUrl: originUrl || null,
    });

  } catch (error) {
    console.error("WIFI CONNECT ERROR:", error);

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Internal server error.",
    });
  }
};
