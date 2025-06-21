#!/bin/bash

# Script de gestion du workflow Git pour Console PME Automation
# Usage: ./scripts/git-workflow.sh [command] [options]

set -e

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction d'aide
show_help() {
    echo -e "${BLUE}Console PME Automation - Workflow Git${NC}"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  feature <name>     Créer une nouvelle branche feature"
    echo "  merge-feature      Merger la feature actuelle dans develop"
    echo "  deploy-staging     Déployer develop vers staging"
    echo "  deploy-prod        Déployer staging vers production"
    echo "  status             Afficher le statut des branches"
    echo "  help               Afficher cette aide"
    echo ""
    echo "Examples:"
    echo "  $0 feature supabase-migration"
    echo "  $0 deploy-staging"
    echo "  $0 deploy-prod"
}

# Fonction pour afficher le statut
show_status() {
    echo -e "${BLUE}=== Statut des branches ===${NC}"
    echo ""
    
    # Branche actuelle
    current_branch=$(git branch --show-current)
    echo -e "Branche actuelle: ${GREEN}$current_branch${NC}"
    echo ""
    
    # Statut des branches principales
    echo -e "${YELLOW}Branches principales:${NC}"
    git branch -a | grep -E "(main|develop|staging)" | while read branch; do
        if [[ $branch == *"$current_branch"* ]]; then
            echo -e "  ${GREEN}* $branch${NC}"
        else
            echo -e "    $branch"
        fi
    done
    echo ""
    
    # Branches de feature
    echo -e "${YELLOW}Branches de feature:${NC}"
    git branch | grep "feature/" | while read branch; do
        if [[ $branch == *"$current_branch"* ]]; then
            echo -e "  ${GREEN}* $branch${NC}"
        else
            echo -e "    $branch"
        fi
    done
    echo ""
    
    # Statut des modifications
    if [[ -n $(git status --porcelain) ]]; then
        echo -e "${RED}⚠️  Modifications non commitées:${NC}"
        git status --short
        echo ""
    else
        echo -e "${GREEN}✅ Aucune modification en attente${NC}"
        echo ""
    fi
}

# Fonction pour créer une feature
create_feature() {
    local feature_name=$1
    
    if [[ -z $feature_name ]]; then
        echo -e "${RED}Erreur: Nom de feature requis${NC}"
        echo "Usage: $0 feature <nom-de-la-feature>"
        exit 1
    fi
    
    echo -e "${BLUE}Création de la feature: $feature_name${NC}"
    
    # Vérifier qu'on est sur develop
    current_branch=$(git branch --show-current)
    if [[ $current_branch != "develop" ]]; then
        echo -e "${YELLOW}⚠️  Vous n'êtes pas sur develop. Basculement vers develop...${NC}"
        git checkout develop
        git pull origin develop
    fi
    
    # Créer la branche feature
    feature_branch="feature/$feature_name"
    git checkout -b "$feature_branch"
    
    echo -e "${GREEN}✅ Feature '$feature_branch' créée avec succès${NC}"
    echo -e "${BLUE}Vous pouvez maintenant développer votre feature${NC}"
}

# Fonction pour merger une feature
merge_feature() {
    local current_branch=$(git branch --show-current)
    
    if [[ ! $current_branch =~ ^feature/ ]]; then
        echo -e "${RED}Erreur: Vous devez être sur une branche feature${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Merging de la feature: $current_branch${NC}"
    
    # Vérifier qu'il n'y a pas de modifications en attente
    if [[ -n $(git status --porcelain) ]]; then
        echo -e "${RED}Erreur: Commit d'abord vos modifications${NC}"
        git status --short
        exit 1
    fi
    
    # Aller sur develop et merger
    git checkout develop
    git pull origin develop
    git merge "$current_branch"
    git push origin develop
    
    # Supprimer la branche feature
    echo -e "${YELLOW}Suppression de la branche feature...${NC}"
    git branch -d "$current_branch"
    
    echo -e "${GREEN}✅ Feature mergée avec succès dans develop${NC}"
}

# Fonction pour déployer en staging
deploy_staging() {
    echo -e "${BLUE}Déploiement vers staging...${NC}"
    
    # Vérifier qu'on est sur develop
    current_branch=$(git branch --show-current)
    if [[ $current_branch != "develop" ]]; then
        echo -e "${YELLOW}⚠️  Basculement vers develop...${NC}"
        git checkout develop
    fi
    
    # Mettre à jour develop
    git pull origin develop
    
    # Merger dans staging
    git checkout staging
    git pull origin staging
    git merge develop
    git push origin staging
    
    echo -e "${GREEN}✅ Déployé vers staging avec succès${NC}"
    echo -e "${BLUE}URL: https://staging.console-pme-automation.amplifyapp.com${NC}"
}

# Fonction pour déployer en production
deploy_prod() {
    echo -e "${BLUE}Déploiement vers production...${NC}"
    
    # Vérifier qu'on est sur staging
    current_branch=$(git branch --show-current)
    if [[ $current_branch != "staging" ]]; then
        echo -e "${YELLOW}⚠️  Basculement vers staging...${NC}"
        git checkout staging
    fi
    
    # Mettre à jour staging
    git pull origin staging
    
    # Confirmation pour la production
    echo -e "${RED}⚠️  ATTENTION: Vous êtes sur le point de déployer en PRODUCTION${NC}"
    read -p "Êtes-vous sûr ? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Déploiement annulé${NC}"
        exit 0
    fi
    
    # Merger dans main
    git checkout main
    git pull origin main
    git merge staging
    git push origin main
    
    echo -e "${GREEN}✅ Déployé vers production avec succès${NC}"
    echo -e "${BLUE}URL: https://console-pme-automation.amplifyapp.com${NC}"
}

# Gestion des commandes
case "$1" in
    "feature")
        create_feature "$2"
        ;;
    "merge-feature")
        merge_feature
        ;;
    "deploy-staging")
        deploy_staging
        ;;
    "deploy-prod")
        deploy_prod
        ;;
    "status")
        show_status
        ;;
    "help"|"--help"|"-h"|"")
        show_help
        ;;
    *)
        echo -e "${RED}Commande inconnue: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac 