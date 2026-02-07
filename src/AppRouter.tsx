import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";

import SceneExplorer from "./pages/SceneExplorer";
import SceneView from "./pages/SceneView";
import AvatarSetup from "./pages/AvatarSetup";
import JoinGuide from "./pages/JoinGuide";
import Messages from "./pages/Messages";
import Settings from "./pages/Settings";
import { NIP19Page } from "./pages/NIP19Page";
import NotFound from "./pages/NotFound";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

export function AppRouter() {
  return (
    <BrowserRouter future={routerFuture}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<SceneExplorer />} />
        <Route path="/scene/:npub" element={<SceneView />} />
        <Route path="/avatar" element={<AvatarSetup />} />
        <Route path="/join" element={<JoinGuide />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/settings" element={<Settings />} />
        {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
        <Route path="/:nip19" element={<NIP19Page />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;
