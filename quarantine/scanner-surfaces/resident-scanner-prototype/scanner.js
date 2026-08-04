// scanner.js (Lifecycle Test Harness)

// ==========================================
// 1. API & STATE ARCHITECTURE
// ==========================================
const api = {
    createVerifiedBounty: (bucket) => {
        console.log("Watchtower API: Bounty created", bucket);
        // Supabase placeholder goes here
    }
};

const state = {
    // Bucket Lifecycle State
    activeBucketId: null,
    bucketLocked: false,
    
    // Scan State
    isScanning: false,
    pendingVerification: null,
    pendingReward: 0, // Tracks the XP reward for the current active verification
    
    // Current Collection Data
    bucketValue: 0,
    materialsFound: 0,
    impact: 0,
    inventory: [],
    collections: {},
    valBreakdown: [],
    upsells: [],
    missions: [],
    verifyStatus: {
        org: false,
        buck: false,
        scale: false
    },
    
    // Lifetime Statistics (Persists across buckets)
    totalXp: 0,
    xpLedger: [],
    bucketsCompleted: typeof localStorage !== 'undefined' ? parseInt(localStorage.getItem('wtwr_buckets') || 0) : 0
};

// ==========================================
// 2. DOM BINDINGS 
// ==========================================
const els = {}; // Handled entirely inside init() now

// ==========================================
// 3. CORE APP LOGIC
// ==========================================
const ScannerApp = {

    init() {
        console.log("WATCHTOWER SCANNER STARTING");

        // Grab elements after DOM is loaded
        els.agreementModal = document.getElementById('agreement-modal');
        els.consoleText = document.getElementById('console-text');
        els.aiOverlay = document.getElementById('ai-overlay');
        els.mockCamera = document.getElementById('mock-camera-overlay');
        
        els.scanBtn = document.getElementById('btn-shutter');
        els.photoBtn = document.getElementById('capture-btn'); 

        els.orgBtn = document.getElementById('v-org');
        els.buckBtn = document.getElementById('v-buck');
        els.scaleBtn = document.getElementById('v-scale');

        console.log("Scanner Button:", els.scanBtn);

        // Bind Events
        if (els.scanBtn) {
            els.scanBtn.addEventListener('click', () => {
                console.log("SCAN BUTTON PRESSED");
                this.executeScan();
            });
        }

        if (els.photoBtn) {
            els.photoBtn.addEventListener('click', () => {
                console.log("PHOTO CAPTURE PRESSED");
                this.capturePhoto();
            });
        }

        if (els.orgBtn) {
            els.orgBtn.addEventListener('click', () => {
                this.captureProof('org', 50, 'Organized Material');
            });
        }

        if (els.buckBtn) {
            els.buckBtn.addEventListener('click', () => {
                this.captureProof('buck', 50, 'Bucket Verification');
            });
        }

        if (els.scaleBtn) {
            els.scaleBtn.addEventListener('click', () => {
                this.captureProof('scale', 100, 'Scale Weigh-in'); // Updated to 100 XP
            });
        }

        this.startNewBucket();
    },

    updateUI() {
        console.log(`UI Updated. Value: $${state.bucketValue} | Locked: ${state.bucketLocked}`);
        // Triggers your UI refresh logic here
    },

    addXp(amount, reason) {
        state.totalXp += amount;
        state.xpLedger.push({ amount, reason, timestamp: new Date().toISOString() });
        console.log(`Watchtower: Granted ${amount} XP for ${reason}`);
    },

    executeScan() {
        if(state.isScanning) return;

        if(state.bucketLocked) {
            if(els.consoleText) els.consoleText.textContent = "BUCKET LOCKED.\nSTART NEW COLLECTION TO SCAN.";
            return;
        }

        state.isScanning = true;
        if(els.consoleText) els.consoleText.textContent = "SCANNING...";
        
        setTimeout(() => {
            state.isScanning = false;
            state.materialsFound++;
            state.bucketValue += 5; 
            state.impact += 1.5;
            state.inventory.push({ type: "scanned_material", value: 5 });
            
            if(els.consoleText) els.consoleText.textContent = "MATERIAL IDENTIFIED.";
            this.updateUI();
        }, 1200);
    },

    // --- Verification Workflow ---
    captureProof(step, xpReward, title) {
        console.log(`Proof requested: ${title} (${xpReward} XP)`);
        state.pendingVerification = step;
        state.pendingReward = xpReward;
        this.openMockCamera(step);
    },

    openMockCamera(verifyType) {
        state.pendingVerification = verifyType;
        
        if (els.mockCamera) {
            els.mockCamera.classList.remove('hidden');
        }
        
        if (els.consoleText) {
            els.consoleText.textContent = `CAMERA ACTIVE: ${verifyType.toUpperCase()}\nCLICK CAPTURE PHOTO TO VERIFY.`;
        }
        
        if (els.photoBtn && els.photoBtn.classList) {
            els.photoBtn.classList.remove('hidden');
        }
        
        if (els.scanBtn) {
            els.scanBtn.disabled = true; 
        }
    },

    capturePhoto() {
        if (!state.pendingVerification) return;
        
        if (els.mockCamera) {
            els.mockCamera.classList.add('hidden');
        }
        
        if (els.photoBtn && els.photoBtn.classList) {
            els.photoBtn.classList.add('hidden');
        }
        
        if (els.scanBtn) {
            els.scanBtn.disabled = false;
        }
        
        if(els.consoleText) els.consoleText.textContent = "PROCESSING IMAGE...";

        setTimeout(() => {
            state.verifyStatus[state.pendingVerification] = true;
            if(els.consoleText) els.consoleText.textContent = `${state.pendingVerification.toUpperCase()} VERIFIED.`;
            
            // Add XP for successful verification using dynamically stored reward
            const reward = state.pendingReward || 50;
            this.addXp(reward, `${state.pendingVerification.toUpperCase()} Verification`);
            
            state.pendingVerification = null;
            state.pendingReward = 0;
            this.updateUI();
        }, 800);
    },

    // --- Bounty Creation & Lifecycle ---
    acceptAgreement() {
        if (els.agreementModal && els.agreementModal.classList) {
            els.agreementModal.classList.add('hidden');
        }

        const completedBucket = {
            id: state.activeBucketId,
            value: state.bucketValue,
            weight: state.impact,
            materials: [...state.inventory],
            timestamp: new Date().toISOString()
        };

        api.createVerifiedBounty(completedBucket);

        state.bucketLocked = true;
        state.bucketsCompleted++;
        
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('wtwr_buckets', state.bucketsCompleted);
        }

        this.startNewBucket();
    },

    startNewBucket() {
        state.activeBucketId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
            ? crypto.randomUUID() 
            : 'mock-uuid-' + Date.now();

        state.bucketLocked = false;
        state.bucketValue = 0;
        state.materialsFound = 0;
        state.impact = 0;
        state.inventory = [];
        state.collections = {};
        state.valBreakdown = [];
        state.upsells = [];
        state.missions = [];
        
        state.verifyStatus = {
            org: false,
            buck: false,
            scale: false
        };

        if(els.consoleText) els.consoleText.textContent = "NEW COLLECTION STARTED.\nREADY FOR MATERIAL IDENTIFICATION.";

        if (els.aiOverlay && els.aiOverlay.style) {
            els.aiOverlay.style.display = 'none';
        }

        this.updateUI();
    },

    resetDemo() {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('wtwr_buckets', 0);
        }
        state.bucketsCompleted = 0;
        state.totalXp = 0;
        state.xpLedger = [];
        
        this.startNewBucket();
        console.log("Demo reset completely.");
    }
};

// ==========================================
// 4. BROWSER INITIALIZATION
// ==========================================
if (typeof window !== 'undefined') {
    window.ScannerApp = ScannerApp;

    // Temporary bridge while HTML migration finishes
    window.app = ScannerApp;

    // Ensure DOM is fully loaded before querying elements
    if(document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => ScannerApp.init()
        );
    } else {
        ScannerApp.ithis.els = {

consoleText: document.getElementById('console-text'),

btnShutter: document.getElementById('btn-shutter'),

captureBtn: document.getElementById('capture-btn'),

mockCameraOverlay: document.getElementById('mock-camera-overlay'),

cameraTitle: document.getElementById('camera-title'),


vOrg: document.getElementById('v-org'),
vBuck: document.getElementById('v-buck'),
vScale: document.getElementById('v-scale'),


btnFinalize: document.getElementById('btn-finalize'),

agreementModal: document.getElementById('agreement-modal'),

btnAcceptAgreement:
document.getElementById('btn-accept-agreement'),

btnCancelAgreement:
document.getElementById('btn-cancel-agreement'),


btnOpenSheet:
document.getElementById('btn-open-sheet'),

bottomSheet:
document.getElementById('bottom-sheet'),

inventoryList:
document.getElementById('inventory-list'),

btnCloseSheet:
document.getElementById('btn-close-sheet'),


btnReset:
document.getElementById('btn-reset'),

statValue:
document.getElementById('stat-value'),

statItems:
document.getElementById('stat-items'),

statXp:
document.getElementById('stat-xp')

};nit();
    }
}