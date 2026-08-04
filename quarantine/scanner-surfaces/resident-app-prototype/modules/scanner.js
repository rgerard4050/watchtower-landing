export function render() {
    return `
        <section>
            <h1>Material Scanner</h1>

            <div id="scanner-box">
                <p>Ready to scan recovered materials.</p>

                <button id="start-scan">
                    Start Scan
                </button>
            </div>

            <div id="scan-results"></div>
        </section>
    `;
}

export function init() {

    const button = document.getElementById("start-scan");

    if (!button) return;

    button.onclick = () => {

        document.getElementById("scan-results").innerHTML = `
            <h3>Scan Started</h3>
            <p>Camera module coming online...</p>
        `;

    };
}