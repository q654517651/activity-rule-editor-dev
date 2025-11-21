import { Route, Routes } from "react-router-dom";

import PreviewPage from "@/pages/preview";

function App() {
  return (
    <Routes>
      <Route element={<PreviewPage />} path="/" />
    </Routes>
  );
}

export default App;
