import { scanMaterial } from "../services/scanner-api.js";

export function render() {
    return `
        <section>
            <h1>Material Scanner</h1>

            <video id="camera" autoplay playsinline width="300"></video>

            <br>

            <button id="capture">
                Capture Material
            </button>

            <canvas id="canvas" hidden></canvas>

            <div id="results">
                Ready.
            </div>
        </section>
    `;
}

export function init() {

    const video = document.getElementById("camera");
    const button = document.getElementById("capture");
    const canvas = document.getElementById("canvas");
    const results = document.getElementById("results");

    if (!video || !button) {
        console.log("Scanner elements missing");
        return;
    }

    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: "environment"
        }
    })
    .then(stream => {
        video.srcObject = stream;
    })
    .catch(error => {
        results.innerHTML = "Camera error: " + error.message;
    });


    button.addEventListener("click", async () => {

        results.innerHTML = "Capturing...";

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext("2d");

        context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        const imageData = canvas.toDataURL("image/jpeg");
        const imageBase64 = imageData.split(",")[1];

        results.innerHTML = "Analyzing materials...";

        try {

            const result = await scanMaterial(
                imageBase64,
                "image/jpeg"
            );

            results.innerHTML = `
                <h3>Materials Found</h3>
                <pre>${JSON.stringify(result, null, 2)}</pre>
            `;

        } catch(error) {

            results.innerHTML =
                "Scan failed: " + error.message;

        }
    });
}