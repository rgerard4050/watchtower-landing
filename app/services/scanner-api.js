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

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Scanner request failed");
    }

    return await response.json();
}