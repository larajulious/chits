package expo.modules.chitsattachments

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class ChitsAnywhereModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChitsAnywhere")
    AsyncFunction("updateSnapshot") { value: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      require(value.length < 24000 && JSONObject(value).optInt("version") == 1)
      check(context.getSharedPreferences("chits_anywhere", 0).edit().putString("snapshot", value).commit())
      val manager = AppWidgetManager.getInstance(context)
      manager.getAppWidgetIds(ComponentName(context, ChitsAnywhereProvider::class.java)).forEach {
        ChitsAnywhereProvider.render(context, manager, it)
      }
    }
  }
}
