/**
 * Configuration des environnements
 * Ce fichier permet de gérer les variables d'environnement selon la branche Git
 */

const environments = {
  // Production (main)
  main: {
    NEXT_PUBLIC_API_URL: 'https://api.execute-api.eu-west-3.amazonaws.com/prod',
    NEXT_PUBLIC_ENVIRONMENT: 'production',
    NEXT_PUBLIC_APP_URL: 'https://console-pme-automation.amplifyapp.com'
  },
  
  // Staging (staging)
  staging: {
    NEXT_PUBLIC_API_URL: 'https://staging-api.execute-api.eu-west-3.amazonaws.com/staging',
    NEXT_PUBLIC_ENVIRONMENT: 'staging',
    NEXT_PUBLIC_APP_URL: 'https://staging.console-pme-automation.amplifyapp.com'
  },
  
  // Développement (develop)
  develop: {
    NEXT_PUBLIC_API_URL: 'https://dev-api.execute-api.eu-west-3.amazonaws.com/dev',
    NEXT_PUBLIC_ENVIRONMENT: 'development',
    NEXT_PUBLIC_APP_URL: 'https://dev.console-pme-automation.amplifyapp.com'
  }
};

/**
 * Détermine l'environnement basé sur la branche Git
 */
function getEnvironment() {
  const branch = process.env.AMPLIFY_GIT_BRANCH || process.env.BRANCH || 'main';
  
  if (branch === 'main') return 'main';
  if (branch === 'staging') return 'staging';
  if (branch === 'develop') return 'develop';
  
  // Pour les branches de feature, utiliser l'environnement de développement
  return 'develop';
}

/**
 * Retourne les variables d'environnement pour l'environnement actuel
 */
function getEnvironmentVars() {
  const env = getEnvironment();
  const envVars = environments[env] || environments.develop;
  
  return {
    ...envVars
  };
}

module.exports = {
  environments,
  getEnvironment,
  getEnvironmentVars
}; 