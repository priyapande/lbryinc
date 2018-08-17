import { Lbry } from 'lbry-redux';
import { doGenerateAuthToken } from 'redux/actions/auth';
import querystring from 'querystring';

const Lbryio = {
  enabled: true,
  authenticationPromise: null,
};

const CONNECTION_STRING = process.env.LBRY_APP_API_URL
  ? process.env.LBRY_APP_API_URL.replace(/\/*$/, '/') // exactly one slash at the end
  : 'https://api.lbry.io/';

Lbryio.call = (resource, action, params = {}, method = 'get') => {
  if (!Lbryio.enabled) {
    return Promise.reject(new Error(__('LBRY internal API is disabled')));
  }

  if (!(method === 'get' || method === 'post')) {
    return Promise.reject(new Error(__('Invalid method')));
  }

  function checkAndParse(response) {
    if (response.status >= 200 && response.status < 300) {
      return response.json();
    }
    return response.json().then(json => {
      let error;
      if (json.error) {
        error = new Error(json.error);
      } else {
        error = new Error('Unknown API error signature');
      }
      error.response = response; // This is primarily a hack used in actions/user.js
      return Promise.reject(error);
    });
  }

  function makeRequest(url, options) {
    return fetch(url, options).then(checkAndParse);
  }

  return Lbryio.getAuthToken().then(token => {
    const fullParams = { auth_token: token, ...params };
    const qs = querystring.stringify(fullParams);
    let url = `${CONNECTION_STRING}${resource}/${action}?${qs}`;

    let options = {
      method: 'GET',
    };

    if (method === 'post') {
      options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: qs,
      };
      url = `${CONNECTION_STRING}${resource}/${action}`;
    }

    return makeRequest(url, options).then(response => response.data);
  });
};

Lbryio.authToken = null;

Lbryio.getAuthToken = () =>
  new Promise(resolve => {
    if (Lbryio.authToken) {
      resolve(Lbryio.authToken);
    } else {
      const { store } = window;
      if (store) {
        const state = store.getState();
        const token = state.auth ? state.auth.authToken : null;
        Lbryio.authToken = token;
        resolve(token);
      }

      resolve(null);
    }
  });

Lbryio.getCurrentUser = () => Lbryio.call('user', 'me');

Lbryio.authenticate = () => {
  if (!Lbryio.enabled) {
    return new Promise(resolve => {
      resolve({
        id: 1,
        language: 'en',
        primary_email: 'disabled@lbry.io',
        has_verified_email: true,
        is_identity_verified: true,
        is_reward_approved: false,
      });
    });
  }

  if (Lbryio.authenticationPromise === null) {
    Lbryio.authenticationPromise = new Promise((resolve, reject) => {
      Lbryio.getAuthToken()
        .then(token => {
          if (!token || token.length > 60) {
            return false;
          }

          // check that token works
          return Lbryio.getCurrentUser()
            .then(() => true)
            .catch(() => false);
        })
        .then(isTokenValid => {
          if (isTokenValid) {
            return reject;
          }

          return Lbry.status().then(status => {
            const { store } = window;
            if (store) {
              store.dispatch(doGenerateAuthToken(status.installation_id));
              return resolve();
            }

            return reject();
          });
        })
        .then(Lbryio.getCurrentUser)
        .then(resolve, reject);
    });
  }

  return Lbryio.authenticationPromise;
};

Lbryio.getStripeToken = () =>
  CONNECTION_STRING.startsWith('http://localhost:')
    ? 'pk_test_NoL1JWL7i1ipfhVId5KfDZgo'
    : 'pk_live_e8M4dRNnCCbmpZzduEUZBgJO';

export default Lbryio;