(function () {
  var SUPABASE_URL = 'https://eypovuxuddiqgncjdpkq.supabase.co';
  var SUPABASE_ANON = 'sb_publishable_ZlykauNc-3YY80w6nxzsKw_Z2lgAgU1';

  var thisScript = document.currentScript;
  var loginUrl = new URL('operator-login.html', thisScript.src).href;

  document.documentElement.style.visibility = 'hidden';

  function redirectToLogin() {
    var next = encodeURIComponent(window.location.href);
    window.location.replace(loginUrl + '?next=' + next);
  }

  if (!window.supabase) {
    window.watchtowerOperatorReady = Promise.resolve(false);
    redirectToLogin();
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  window.watchtowerAuth = client;

  window.watchtowerOperatorReady = client.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (!session) {
      return false;
    }
    return client
      .from('operators')
      .select('id')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(function (opRes) {
        if (opRes.error || !opRes.data) {
          return false;
        }
        document.documentElement.style.visibility = 'visible';
        return true;
      });
  }).catch(function () {
    return false;
  }).then(function (isOperator) {
    if (!isOperator) redirectToLogin();
    return isOperator;
  });

  window.watchtowerSignOut = function () {
    client.auth.signOut().then(redirectToLogin);
  };
})();
