import ExpoModulesCore

public final class ChitsPdfModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChitsPdf")

    View(ChitsPdfView.self) {
      Events("onLoadComplete", "onPageChanged", "onError")

      Prop("source") { (view: ChitsPdfView, source: String?) in
        view.setSource(source)
      }

      Prop("canvasColor") { (view: ChitsPdfView, color: String?) in
        view.setCanvasColor(color)
      }
    }
  }
}
