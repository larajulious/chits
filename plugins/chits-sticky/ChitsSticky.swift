import WidgetKit
import SwiftUI
import AppIntents
internal import ExpoWidgets

// Sticky Notes. Copied over expo-widgets' generated ChitsSticky.swift by
// plugins/with-chits-sticky.js: the same Space choice the app config declares,
// with a fallback for before the app's first publish and translated titles.
// Rendering is still expo-widgets': the layout in
// src/features/sticky-widget/widget.tsx gets the Space as `configuration.space`.

private let stickyWidgetName = "ChitsSticky"

@available(iOS 17.0, *)
enum ChitsStickySpace: String, AppEnum {
  case fridge, desk, cork, wall

  static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Space")
  static let caseDisplayRepresentations: [ChitsStickySpace: DisplayRepresentation] = [
    .fridge: DisplayRepresentation(title: "Fridge"),
    .desk: DisplayRepresentation(title: "Desk"),
    .cork: DisplayRepresentation(title: "Cork board"),
    .wall: DisplayRepresentation(title: "Wall"),
  ]
}

@available(iOS 17.0, *)
struct ChitsStickyConfigurationAppIntent: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "Choose a Space"
  static let description: IntentDescription? = IntentDescription("Pick the Space this widget shows.")

  @Parameter(title: "Space", default: .fridge)
  var space: ChitsStickySpace

  init() {}

  func perform() async throws -> some IntentResult {
    return .result()
  }
}

@available(iOS 17.0, *)
struct ChitsStickyTimelineEntry: TimelineEntry {
  let date: Date
  let props: [String: Any]?
  let entryIndex: Int?
  let space: String
}

@available(iOS 17.0, *)
struct ChitsStickyTimelineProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> ChitsStickyTimelineEntry {
    ChitsStickyTimelineEntry(date: Date(), props: nil, entryIndex: nil, space: ChitsStickySpace.fridge.rawValue)
  }

  func snapshot(for configuration: ChitsStickyConfigurationAppIntent, in context: Context) async -> ChitsStickyTimelineEntry {
    entries(for: configuration).last ?? placeholder(in: context)
  }

  // The app republishes whenever a note or a Space changes, so there's nothing to schedule.
  func timeline(for configuration: ChitsStickyConfigurationAppIntent, in context: Context) async -> Timeline<ChitsStickyTimelineEntry> {
    Timeline(entries: entries(for: configuration), policy: .never)
  }

  private func entries(for configuration: ChitsStickyConfigurationAppIntent) -> [ChitsStickyTimelineEntry] {
    let space = configuration.space.rawValue
    let timeline = WidgetsStorage.getArray(forKey: "__expo_widgets_\(stickyWidgetName)_timeline") ?? []
    let entries: [ChitsStickyTimelineEntry] = timeline.enumerated().compactMap { index, entry in
      guard let entry = entry as? [String: Any],
            let timestamp = entry["timestamp"] as? Int,
            let props = entry["props"] as? [String: Any] else {
        return nil
      }
      return ChitsStickyTimelineEntry(date: Date(timeIntervalSince1970: Double(timestamp) / 1000), props: props, entryIndex: index, space: space)
    }
    // Before the app's first publish, the layout still draws the bare Space.
    return entries.isEmpty ? [ChitsStickyTimelineEntry(date: Date(), props: [:], entryIndex: nil, space: space)] : entries
  }
}

@available(iOS 17.0, *)
struct ChitsStickyEntryView: View {
  @Environment(\.self) var environment
  var entry: ChitsStickyTimelineEntry

  private var widgetEnvironment: [String: Any] {
    var env: [String: Any] = getWidgetEnvironment(environment: environment)
    env["timestamp"] = Int(entry.date.timeIntervalSince1970 * 1000)
    env["configuration"] = ["space": entry.space]
    return env
  }

  private var widgetEnvironmentString: String? {
    guard let data = try? JSONSerialization.data(withJSONObject: widgetEnvironment) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  var body: some View {
    if let layout = WidgetsStorage.getString(forKey: "__expo_widgets_\(stickyWidgetName)_layout"), !layout.isEmpty {
      let node = evaluateLayout(layout: layout, props: entry.props ?? [:], environment: widgetEnvironment)
      WidgetsDynamicView(name: stickyWidgetName, kind: .widget, node: node, entryIndex: entry.entryIndex, environmentString: widgetEnvironmentString)
    } else {
      // Installed but never opened: the app hasn't handed the widget its layout yet.
      Text("Open Chits to set up your sticky notes.")
        .font(.custom("Nunito-SemiBold", size: 16))
        .foregroundStyle(Color(red: 0.165, green: 0.149, blue: 0.133))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(16)
        .containerBackground(Color(red: 1, green: 0.886, blue: 0.478), for: .widget)
    }
  }
}

@available(iOS 17.0, *)
struct ChitsSticky: Widget {
  let name: String = stickyWidgetName

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: name, intent: ChitsStickyConfigurationAppIntent.self, provider: ChitsStickyTimelineProvider()) { entry in
      ChitsStickyEntryView(entry: entry)
    }
    .configurationDisplayName("Sticky Notes")
    .description("A Space and its sticky notes, right on your Home Screen.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    .contentMarginsDisabled()
  }
}
