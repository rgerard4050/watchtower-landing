export async function scanMaterial(imageBase64, mediaType = "image/jpeg") {

    const response = await fetch("/api/scan.js", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            imageBase64,
            mediaType
        })
    });

    const raw = await response.text();

    console.log("WATCHTOWER SCAN API RESPONSE:", raw);

    let data;

    try {
        data = JSON.parse(raw);
    } catch (error) {
        throw new Error(
            "Scan API returned invalid JSON: " + raw
        );
    }

    if (!response.ok) {
        throw new Error(data.error || "Scanner request failed");
    }

    return data;
}