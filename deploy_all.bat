@echo off
setlocal
echo ==========================================
echo   EXPRESS CARGO - GLOBAL DEPLOYMENT
echo ==========================================
echo.

:: ============================================
:: CONFIGURATION
:: ============================================
set GITHUB_USER=bomilslt
set REPO_NAME=Logis

:: Repos GitHub pour les subtrees (GitHub Pages)
:: Chaque frontend web est deploye sur un repo separe via subtree
set CLIENT_REPO=logis-client
set ADMIN_REPO=logis-tenant
set SUPERADMIN_REPO=logis-superadmin

:: Token GitHub (Personal Access Token)
:: Laisser vide pour utiliser Git Credential Manager
set GITHUB_TOKEN=
if defined GITHUB_TOKEN (
    set AUTH_PREFIX=%GITHUB_TOKEN%@
) else (
    set AUTH_PREFIX=
)

:: ============================================
:: STEP 1: Push main repository
:: ============================================
echo.
echo [1/4] Pushing main repository...
git add -A
git commit -m "deploy: update all apps" 2>nul
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to push main repo.
    pause
    exit /b %ERRORLEVEL%
)
echo [OK] Main repository pushed.

:: ============================================
:: STEP 2: Deploy Client Web (client.expresscargo.com)
:: ============================================
echo.
echo [2/4] Deploying Client Web...
echo       Subtree: frontend-logi/client-web
echo       Repo:    %CLIENT_REPO%
echo       CNAME:   client.expresscargo.com
git subtree push --prefix frontend-logi/client-web https://%AUTH_PREFIX%github.com/%GITHUB_USER%/%CLIENT_REPO%.git gh-pages
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Subtree push failed for client-web. Trying split+push...
    git subtree split --prefix frontend-logi/client-web -b temp-client-deploy
    git push https://%AUTH_PREFIX%github.com/%GITHUB_USER%/%CLIENT_REPO%.git temp-client-deploy:gh-pages --force
    git branch -D temp-client-deploy
)
echo [OK] Client Web deployed.

:: ============================================
:: STEP 3: Deploy Tenant Admin (admin.expresscargo.com)
:: ============================================
echo.
echo [3/4] Deploying Tenant Admin...
echo       Subtree: frontend-logi/tenant-web
echo       Repo:    %ADMIN_REPO%
echo       CNAME:   admin.expresscargo.com
git subtree push --prefix frontend-logi/tenant-web https://%AUTH_PREFIX%github.com/%GITHUB_USER%/%ADMIN_REPO%.git gh-pages
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Subtree push failed for tenant-web. Trying split+push...
    git subtree split --prefix frontend-logi/tenant-web -b temp-admin-deploy
    git push https://%AUTH_PREFIX%github.com/%GITHUB_USER%/%ADMIN_REPO%.git temp-admin-deploy:gh-pages --force
    git branch -D temp-admin-deploy
)
echo [OK] Tenant Admin deployed.

:: ============================================
:: STEP 4: Deploy Super Admin (superadmin.expresscargo.com)
:: ============================================
echo.
echo [4/4] Deploying Super Admin...
echo       Subtree: frontend-logi/superadmin-web
echo       Repo:    %SUPERADMIN_REPO%
echo       CNAME:   superadmin.expresscargo.com
git subtree push --prefix frontend-logi/superadmin-web https://%AUTH_PREFIX%github.com/%GITHUB_USER%/%SUPERADMIN_REPO%.git gh-pages
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Subtree push failed for superadmin-web. Trying split+push...
    git subtree split --prefix frontend-logi/superadmin-web -b temp-sa-deploy
    git push https://%AUTH_PREFIX%github.com/%GITHUB_USER%/%SUPERADMIN_REPO%.git temp-sa-deploy:gh-pages --force
    git branch -D temp-sa-deploy
)
echo [OK] Super Admin deployed.

:: ============================================
:: DONE
:: ============================================
echo.
echo ==========================================
echo   DEPLOYMENT COMPLETE
echo ==========================================
echo.
echo   Main repo    : github.com/%GITHUB_USER%/%REPO_NAME%
echo   Client Web   : client.expresscargo.com   (%CLIENT_REPO%)
echo   Tenant Admin : admin.expresscargo.com     (%ADMIN_REPO%)
echo   Super Admin  : superadmin.expresscargo.com (%SUPERADMIN_REPO%)
echo   Backend      : Deploy separately on Railway
echo.
echo   NOTE: Make sure the 3 GitHub repos exist and
echo         GitHub Pages is enabled on the gh-pages branch.
echo.
pause
