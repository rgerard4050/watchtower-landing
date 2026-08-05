const pages = {
    home: "/app/modules/home.js",
    scanner: "/app/modules/scanner.js",
    marketplace: "/app/modules/marketplace.js",
    dispatch: "/app/modules/dispatch.js",
    wallet: "/app/modules/wallet.js"
};

window.loadPage = async function(page) {

    try {
        const module = await import(pages[page]);

        document.getElementById("app").innerHTML =
            module.render();

        if (module.init) {
            module.init();
        }

    } catch (error) {

        console.error("WATCHTOWER PAGE LOAD ERROR:", error);

        document.getElementById("app").innerHTML = `
            <h2>Page failed to load</h2>
            <pre>${error.message}</pre>
        `;
    }
};


function route() {
    const hash = window.location.hash.replace("#", "");

    if (pages[hash]) {
        loadPage(hash);
    } else {
        loadPage("home");
    }
}


window.addEventListener("hashchange", route);

route();