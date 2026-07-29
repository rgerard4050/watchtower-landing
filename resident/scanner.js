const materials = [
    {
        name: "ALUMINUM CANS",
        weight: 4,
        value: 6.25,
        wtwr: 625,
        tip: "Separate aluminum from steel cans to increase recovery value."
    },
    {
        name: "COPPER WIRE",
        weight: 3,
        value: 7.75,
        wtwr: 775,
        tip: "Remove insulation only when safe and practical."
    },
    {
        name: "SMALL APPLIANCE",
        weight: 5,
        value: 4.50,
        wtwr: 450,
        tip: "Keep electronics together for better processing."
    },
    {
        name: "E-WASTE",
        weight: 2,
        value: 10.00,
        wtwr: 1000,
        tip: "Separate batteries before collection."
    },
    {
        name: "CARDBOARD",
        weight: 8,
        value: 3.00,
        wtwr: 300,
        tip: "Keep cardboard dry and flattened."
    }
];

let scanIndex = 0;
let totalValue = 0;
let totalWtwr = 0;
let totalWeight = 0;
let materialsFound = 0;

const scanButton = document.getElementById("btn-scan");
const resetButton = document.getElementById("btn-reset");
const requestButton = document.getElementById("btn-request");

const camera = document.getElementById("camera-container");
const overlay = document.getElementById("ai-overlay");
const overlayTag = document.getElementById("overlay-tag");
const consoleText = document.getElementById("console-text");

const progress = document.getElementById("progress-bar-fill");
const percentage = document.getElementById("bucket-percentage");
const currentValue = document.getElementById("current-value");

const statMaterials = document.getElementById("stat-materials");
const statWtwr = document.getElementById("stat-wtwr");
const statValue = document.getElementById("stat-total-value");
const statImpact = document.getElementById("stat-impact");

const bountyAlert = document.getElementById("bounty-alert");


function log(message) {
    consoleText.innerHTML = message;
}


function runScan() {

    if (scanIndex >= materials.length) {
        log("SCAN COMPLETE.\nALL DEMO MATERIALS IDENTIFIED.");
        return;
    }


    const material = materials[scanIndex];

    scanIndex++;

    camera.classList.add("scanning");

    overlay.style.display = "flex";
    overlayTag.textContent = "AI IDENTIFIED: " + material.name;


    log(
`ANALYZING MATERIAL...

TARGET FOUND:
${material.name}

+${material.weight} lbs
+$${material.value.toFixed(2)}

TIP:
${material.tip}`
    );


    setTimeout(() => {

        camera.classList.remove("scanning");
        overlay.style.display = "none";


        totalValue += material.value;
        totalWtwr += material.wtwr;
        totalWeight += material.weight;
        materialsFound++;


        updateDashboard();


    },1200);

}



function updateDashboard(){

    const percent = Math.min((totalValue / 25) * 100,100);

    progress.style.width = percent + "%";

    percentage.textContent =
        Math.floor(percent) + "%";


    currentValue.textContent =
        "$" + totalValue.toFixed(2);


    statMaterials.textContent =
        materialsFound;


    statWtwr.textContent =
        totalWtwr.toLocaleString();


    statValue.textContent =
        totalValue.toFixed(2);


    statImpact.textContent =
        totalWeight;


    if(totalValue >= 25){

        bountyAlert.classList.remove("hidden");

        requestButton.classList.remove("hidden");

        bountyAlert.innerHTML =
`
<h3>BOUNTY READY</h3>
<p>Your material bucket reached pickup value.</p>
<div class="driver-info">
LOCAL DRIVERS CAN ACCEPT THIS RUN
</div>
`;

        log(
`BOUNTY UNLOCKED

VERIFIED MATERIAL VALUE:
$${totalValue.toFixed(2)}

DRIVER NETWORK AVAILABLE`
        );

    }

}



function resetDemo(){

    scanIndex = 0;
    totalValue = 0;
    totalWtwr = 0;
    totalWeight = 0;
    materialsFound = 0;

    progress.style.width="0%";
    percentage.textContent="0%";
    currentValue.textContent="$0.00";

    statMaterials.textContent="0";
    statWtwr.textContent="0";
    statValue.textContent="0.00";
    statImpact.textContent="0";

    bountyAlert.classList.add("hidden");
    requestButton.classList.add("hidden");

    log("SYSTEM READY. AWAITING SCAN INPUT...");
}


scanButton.addEventListener("click", runScan);

resetButton.addEventListener("click", resetDemo);


requestButton.addEventListener("click",()=>{

    log(
`REQUEST SENT

SEARCHING OCALA DRIVER NETWORK...

MATCH FOUND:
DRIVER AVAILABLE
ETA: 18 MINUTES`
    );

});