"use client";

import { AppHeader, Footer } from "@/app/orbita-views";
import { OrbitaViewRouter } from "@/app/orbita-view-router";
import { useOrbitaController, type OrbitaControllerOptions } from "@/hooks/use-orbita-controller";

export function OrbitaApp(options: OrbitaControllerOptions) {
  const controller = useOrbitaController(options);
  const immersive = controller.view === "assessment";

  return (
    <div className={immersive ? "orbita-app immersive" : "orbita-app"}>
      {!immersive ? <AppHeader onNavigate={controller.go} view={controller.view} /> : null}
      {controller.requestError ? <div className="global-error" role="alert">{controller.requestError}<button onClick={controller.dismissRequestError} type="button" aria-label="Закрыть">×</button></div> : null}
      <OrbitaViewRouter controller={controller} />
      {!immersive ? <Footer onNavigate={controller.go} /> : null}
      {controller.view !== "admin" && !immersive ? <button className="admin-secret" onClick={() => controller.go("admin")} type="button" aria-label="Открыть внутреннюю панель">⌘</button> : null}
    </div>
  );
}
