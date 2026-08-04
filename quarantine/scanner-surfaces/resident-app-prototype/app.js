const pages = {
    home: "./modules/home.js",
    scanner: "./modules/scanner.js",
    marketplace: "./modules/marketplace.js",
    dispatch: "./modules/dispatch.js",
    wallet: "./modules/wallet.js"
};

window.loadPage = async function(page) {

    const module = await import(pages[page]);

    document.getElementById("app").innerHTML =
        module.render();

    if (module.init) {
        module.init();
    }
};

loadPage("home");