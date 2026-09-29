module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
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

    // Check environment variables without exposing secrets
    if (!controllerUrl || !controllerId || !username || !password) {
      return res.status(500).json({
        ok: false,
        stage: "environment",
        error: "Missing Omada environment variables.",
        variables: {
          controllerUrl: Boolean(controllerUrl),
          controllerId: Boolean(controllerId),
          username: Boolean(username),
          password: Boolean(password),
        }
      });
    }

    const loginUrl =
      `${controllerUrl}/${encodeURIComponent(controllerId)}` +
      `/api/v2/hotspot/login`;

    console.log("Testing Omada Hotspot Operator login...");

    const response = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        name: username,
        password: password
      })
    });

    const responseText = await response.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        ok: false,
        stage: "omada-response",
        error: "Omada response was not valid JSON.",
        httpStatus: response.status,
        responsePreview: responseText.slice(0, 300)
      });
    }

    if (!response.ok || Number(data.errorCode) !== 0) {
      return res.status(502).json({
        ok: false,
        stage: "omada-login",
        error: "Omada Hotspot Operator login failed.",
        httpStatus: response.status,
        errorCode: data.errorCode,
        message: data.msg || data.message || null
      });
    }

    const csrfToken =
      data?.result?.token ||
      data?.value ||
      "";

    let hasSessionCookie = false;

    if (
      response.headers &&
      typeof response.headers.getSetCookie === "function"
    ) {
      hasSessionCookie =
        response.headers.getSetCookie().length > 0;
    } else {
      hasSessionCookie =
        Boolean(response.headers.get("set-cookie"));
    }

    return res.status(200).json({
      ok: true,
      test: "omada-login",
      message: "Omada Hotspot Operator login successful.",
      controllerReachable: true,
      tokenReceived: Boolean(csrfToken),
      sessionCookieReceived: hasSessionCookie
    });

  } catch (error) {
    console.error("OMADA TEST ERROR:", error);

    return res.status(500).json({
      ok: false,
      stage: "connection",
      error: error?.message || "Unable to connect to Omada."
    });
  }
};
