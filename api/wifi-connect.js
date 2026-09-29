module.exports = async function handler(req, res) {
  // POST only
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const controllerUrl = String(
      process.env.OMADA_CONTROLLER_URL || ""
    ).replace(/\/+$/, "");

    const controllerId = String(
      process.env.OMADA_CONTROLLER_ID || ""
    ).trim();

    const username = String(
      process.env.OMADA_OPERATOR_USERNAME || ""
    ).trim();

    const password = String(
      process.env.OMADA_OPERATOR_PASSWORD || ""
    );

    // Check Vercel environment variables
    if (!controllerUrl || !controllerId || !username || !password) {
      return res.status(500).json({
        ok: false,
        error: "Missing Omada environment variables."
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const clientMac = String(body.clientMac || "").trim();
    const clientIp = String(body.clientIp || "").trim();
    const apMac = String(body.apMac || "").trim();
    const ssidName = String(body.ssidName || "").trim();
    const radioId = String(body.radioId || "").trim();
    const site = String(body.site || "").trim();
    const originUrl = String(
      body.originUrl || body.redirectUrl || ""
    ).trim();

    if (!clientMac || !apMac || !ssidName || !radioId) {
      return res.status(400).json({
        ok: false,
        error: "Missing Omada client information.",
        received: {
          clientMac: !!clientMac,
          clientIp: !!clientIp,
          apMac: !!apMac,
          ssidName: !!ssidName,
          radioId: !!radioId,
          site: !!site
        }
      });
    }

    /*
     * STEP 1
     * Login using the Hotspot Operator account.
     */
    const loginUrl =
      `${controllerUrl}/${controllerId}/api/v2/hotspot/login`;

    const loginResponse = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        name: username,
        password: password
      })
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
        response: loginText.slice(0, 500)
      });
    }

    if (!loginResponse.ok || loginData.errorCode !== 0) {
      return res.status(502).json({
        ok: false,
        error: "Omada Hotspot Operator login failed.",
        omada: loginData
      });
    }

    const csrfToken = loginData?.result?.token;

    if (!csrfToken) {
      return res.status(502).json({
        ok: false,
        error: "Omada did not return a CSRF token."
      });
    }

    /*
     * Omada also requires the session cookie returned
     * by the login request.
     */
    let sessionCookie = "";

    if (
      loginResponse.headers &&
      typeof loginResponse.headers.getSetCookie === "function"
    ) {
      sessionCookie = loginResponse.headers
        .getSetCookie()
        .map(cookie => cookie.split(";")[0])
        .join("; ");
    } else {
      sessionCookie =
        loginResponse.headers.get("set-cookie") || "";

      if (sessionCookie) {
        sessionCookie = sessionCookie
          .split(",")
          .map(cookie => cookie.split(";")[0])
          .join("; ");
      }
    }

    if (!sessionCookie) {
      return res.status(502).json({
        ok: false,
        error: "Omada login succeeded but no session cookie was returned."
      });
    }

    /*
     * STEP 2
     * Authorize the Wi-Fi client.
     */
    const authUrl =
      `${controllerUrl}/${controllerId}/api/v2/hotspot/extPortal/auth`;

    // Default authorization duration: 8 hours
    const authTime = 8 * 60 * 60 * 1000;

    const authPayload = {
      clientMac,
      apMac,
      ssidName,
      radioId,
      time: authTime,
      authType: 4
    };

    // Include these when Omada supplied them
    if (clientIp) {
      authPayload.clientIp = clientIp;
    }

    if (site) {
      authPayload.site = site;
    }

    if (originUrl) {
      authPayload.originUrl = originUrl;
    }

    const authResponse = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Csrf-Token": csrfToken,
        "Cookie": sessionCookie
      },
      body: JSON.stringify(authPayload)
    });

    const authText = await authResponse.text();

    let authData;

    try {
      authData = JSON.parse(authText);
    } catch {
      return res.status(502).json({
        ok: false,
        error: "Omada returned an invalid authorization response.",
        status: authResponse.status,
        response: authText.slice(0, 500)
      });
    }

    if (!authResponse.ok || authData.errorCode !== 0) {
      return res.status(502).json({
        ok: false,
        error: "Omada client authorization failed.",
        omada: authData
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Wi-Fi client authorized successfully."
    });

  } catch (error) {
    console.error("WIFI CONNECT ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "Internal server error."
    });
  }
};
