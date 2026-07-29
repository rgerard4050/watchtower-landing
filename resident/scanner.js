// Strict 5-Event Gamified Scan Loop
const scanDatabase = [
    {
        material: "Aluminum Cans",
        value: 3.50,
        wtwr: 350,
        impact: 6,
        items: ["Beverage Containers", "Crushed Cans"],
        tip: "COACHING TIP: Crush cans to save space and increase bucket capacity."
    },
    {
        material: "Copper Wire",
        value: 12.00,
        wtwr: 1200,
        impact: 12,
        items: ["Stripped Copper", "Electrical Wire"],
        tip: "COACHING TIP: Stripped wire yields 20% higher commodity market value."
    },
    {
        material: "Small Appliance",
        value: 5.00,
        wtwr: 500,
        impact: 15,
        items: ["Toaster", "Blender Motor"],
        tip: "COACHING TIP: Keep cords attached; they contain valuable copper."
    },
    {
        material: "E-waste",
        value: 8.50,
        wtwr: 850,
        impact: 8,
        items: ["Circuit Boards", "Old Smartphone"],
        tip: "COACHING TIP: Lithium batteries must be verified and separated before processing."
    },
    {
        material: "Cardboard",
        value: 2.00,
        wtwr: 200,
        impact: 25,
        items: ["Corrugated Boxes", "Packaging"],
        tip: "COACHING TIP: Break down boxes and keep them dry to preserve recovery value."
    }
];

const THRESHOLD = 25.00;

// State Variables
let bucketValue = parseFloat(localStorage.getItem('wtwr_bucketValue')) || 0;
let materialsFound = parseInt(localStorage.getItem('wtwr_materialsFound')) || 0;
let wtwr = parseInt(localStorage.getItem('wtwr_wtwr')) || 0;
let impact = parseInt(localStorage.getItem('wtwr_impact')) || 0;
let currentScanIndex = parseInt(localStorage.getItem('wtwr_scanIndex')) || 0;

// DOM Elements
const btnScan = document.getElementById('btn-scan');
const btnRequest = document.getElementById('btn-request');
const btnReset = document.getElementById('btn-reset');
const cameraContainer = document.getElementById('camera-container');
const consoleText = document.getElementById('console-text');
const aiOverlay = document.getElementById('ai-overlay');
const overlayTag = document.getElementById('overlay-tag');

const progressBar = document.getElementById('progress-bar-fill');
const bucketPercentage = document.getElementById('bucket-percentage');
const currentValueDisplay = document.getElementById('current-value');
const bucketStatus = document.getElementById('bucket-status');
const bountyAlert = document.getElementById('bounty-alert');

const statMaterials = document.getElementById('stat-materials');
const statWtwr = document.getElementById('stat-wtwr');
const statTotalValue = document.getElementById('stat-total-value');
const statImpact = document.getElementById('stat-impact');

function init() {
    updateUI();
}

function saveState() {
    localStorage.setItem('wtwr_bucketValue', bucketValue);
    localStorage.setItem('wtwr_materialsFound', materialsFound);
    localStorage.setItem('wtwr_wtwr', wtwr);
    localStorage.setItem('wtwr_impact', impact);
    localStorage.setItem('wtwr_scanIndex', currentScanIndex);
}

function updateUI() {
    statMaterials.textContent = materialsFound;
    statWtwr.textContent = wtwr.toLocaleString();
    statTotalValue.textContent = bucketValue.toFixed(2);
    statImpact.textContent = impact;
    
    currentValueDisplay.textContent = `$${bucketValue.toFixed(2)}`;

    let progress = (bucketValue / THRESHOLD) * 100;
    if (progress > 100) progress = 100;
    
    progressBar.style.width = `${progress}%`;
    bucketPercentage.textContent = `${Math.floor(progress)}%`;

    if (bucketValue >= THRESHOLD) {
        btnScan.classList.add('hidden');
        bountyAlert.classList.remove('hidden');
        btnRequest.classList.remove('hidden');
        bucketStatus.textContent = "Bounty Ready for Pickup";
        bucketStatus.style.color = "var(--wtwr-green)";
        if(consoleText.textContent.includes("AWAITING")) {
            consoleText.innerHTML = `<span style="color: var(--wtwr-green)">SYSTEM STATUS: BOUNTY UNLOCKED.<br>DRIVER DISPATCH AVAILABLE IN LOCAL NETWORK.</span>`;
        }
    } else {
        btnScan.classList.remove('hidden');
        bountyAlert.classList.add('hidden');
        btnRequest.classList.add('hidden');
        bucketStatus.textContent = `Next Pickup Unlock: $${THRESHOLD.toFixed(2)} minimum`;
        bucketStatus.style.color = "var(--text-secondary)";
    }
}

btnScan.addEventListener('click', () => {
    btnScan.disabled = true;
    btnScan.textContent = "SCANNING...";
    cameraContainer.classList.add('scanning');
    aiOverlay.style.display = 'none';
    
    consoleText.style.color = 'var(--text-primary)';
    consoleText.textContent = "CAPTURING MATERIAL...";

    setTimeout(() => {
        consoleText.textContent += "\nANALYZING ALBEDO AND DENSITY...";
        
        setTimeout(() => {
            // Pull the next scan from the loop
            const scanResult = scanDatabase[currentScanIndex];
            
            // Increment loop index (restarts at 0 if it hits the end)
            currentScanIndex = (currentScanIndex + 1) % scanDatabase.length;
            
            // Add to bucket
            bucketValue += scanResult.value;
            wtwr += scanResult.wtwr;
            materialsFound += scanResult.items.length;
            impact += scanResult.impact;
            
            saveState();
            
            cameraContainer.classList.remove('scanning');
            aiOverlay.style.display = 'flex';
            overlayTag.textContent = scanResult.material;
            
            // Render Console Output
            consoleText.innerHTML = `<span style="color: var(--wtwr-green)">AI IDENTIFICATION COMPLETE</span><br><br>`;
            consoleText.innerHTML += `> Material: ${scanResult.material}<br>`;
            consoleText.innerHTML += `> Weight Added: ${scanResult.impact} lbs<br>`;
            consoleText.innerHTML += `> Value: $${scanResult.value.toFixed(2)}<br>`;
            consoleText.innerHTML += `> WTWR Generated: ${scanResult.wtwr}<br>`;
            consoleText.innerHTML += `<span class="tip">${scanResult.tip}</span>`;
            
            btnScan.textContent = "EXECUTE OPTICAL SCAN";
            btnScan.disabled = false;
            
            updateUI();
            
        }, 1200);
    }, 800);
});

btnRequest.addEventListener('click', () => {
    btnRequest.disabled = true;
    btnRequest.textContent = "ROUTING...";
    
    setTimeout(() => {
        alert("DRIVER REQUEST CREATED — BOUNTY BROADCAST TO LOCAL DISPATCH");
        resetDemo();
    }, 1000);
});

function resetDemo() {
    bucketValue = 0;
    materialsFound = 0;
    wtwr = 0;
    impact = 0;
    currentScanIndex = 0;
    
    saveState();
    
    aiOverlay.style.display = 'none';
    cameraContainer.classList.remove('scanning');
    
    btnScan.disabled = false;
    btnScan.textContent = "EXECUTE OPTICAL SCAN";
    
    btnRequest.disabled = false;
    btnRequest.textContent = "REQUEST DRIVER";
    
    consoleText.style.color = 'var(--alert)';
    consoleText.textContent = "SYSTEM READY. AWAITING SCAN INPUT...";
    
    updateUI();
}

btnReset.addEventListener('click', resetDemo);

window.addEventListener('DOMContentLoaded', init);