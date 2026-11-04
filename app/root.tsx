import { useState, type ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation, useRouteError, Link } from "react-router";
import { AppProviders } from "@agent-native/toolkit/app/providers";
import { createAgentNativeQueryClient, useDbSync } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { AppToolkitProvider } from "./components/ui/toolkit-provider";
import { useNavigationState } from "./hooks/use-navigation-state";
import { TAB_ID } from "./lib/tab-id";
import { i18nCatalog } from "./i18n";
import "./global.css";
export const meta = () => [{ title: "Shortlist — source-linked buying decisions" }, { name: "description", content: "Compare supplier quotes, trace every fact to its source and keep human corrections in control while your agent helps." }];
export function Layout({children}:{children:ReactNode}) { return <html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="theme-color" content="#185c3d"/><link rel="icon" href="/favicon.svg"/><Meta/><Links/></head><body>{children}<ScrollRestoration/><Scripts/></body></html>; }
function Sync() { const client=useQueryClient(); useNavigationState(); useDbSync({queryClient:client,ignoreSource:TAB_ID}); return null; }
export default function Root() { const [queryClient]=useState(()=>createAgentNativeQueryClient()); const location=useLocation(); const publicPage=location.pathname==="/"; return <AppProviders queryClient={queryClient} isPublicPath={publicPage} defaultTheme="light" skipFirstRunOnboarding i18n={{catalog:i18nCatalog}} documentTitleFallback="Shortlist"><AppToolkitProvider>{!publicPage&&<Sync/>}<Outlet/></AppToolkitProvider></AppProviders>; }
export function ErrorBoundary() { const error=useRouteError(); const detail=error instanceof Error?error.message:"The workspace could not be loaded. Try opening it again."; return <main style={{padding:40,maxWidth:700,margin:"auto"}}><h1>We could not open this page.</h1><p>{detail}</p><Link to="/">Return to Shortlist</Link></main>; }
