package expo.modules.chitsattachments

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ChitsPdfModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChitsPdf")

    View(ChitsPdfView::class) {
      Events("onLoadComplete", "onPageChanged", "onError")

      Prop("source") { view: ChitsPdfView, source: String? ->
        view.setSource(source)
      }

      Prop("canvasColor") { view: ChitsPdfView, color: String? ->
        view.setCanvasColor(color)
      }

      OnViewDestroys { view: ChitsPdfView ->
        view.release()
      }
    }
  }
}
