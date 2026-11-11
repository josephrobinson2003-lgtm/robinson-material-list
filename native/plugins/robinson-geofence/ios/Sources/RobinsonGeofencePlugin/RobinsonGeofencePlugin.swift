import Foundation
import Capacitor
import CoreLocation

/// Job-site enter/exit only. This file has not been run on an iPhone.
/// Continuous location updates are intentionally not started, and coordinates are not stored.
@objc(RobinsonGeofencePlugin)
public class RobinsonGeofencePlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "RobinsonGeofencePlugin"
    public let jsName = "RobinsonGeofence"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "armForToday", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ackEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToken", returnType: CAPPluginReturnPromise)
    ]

    private let manager = CLLocationManager()
    private let defaults = UserDefaults.standard
    private let queueKey = "re_geofence_events"
    private let armedKey = "re_geofence_armed_date"
    private let service = "com.robinsonelectrical.crew"

    override public func load() {
        manager.delegate = self
        manager.allowsBackgroundLocationUpdates = false
        manager.showsBackgroundLocationIndicator = false
    }

    @objc func getCapabilities(_ call: CAPPluginCall) {
        call.resolve([
            "platform": "ios",
            "backgroundGeofence": true,
            "implementation": "core-location-regions",
            "coordinatesPersisted": false,
            "secureStorage": true,
            "deviceTested": false
        ])
    }

    @objc func armForToday(_ call: CAPPluginCall) {
        guard manager.authorizationStatus == .authorizedAlways else {
            if manager.authorizationStatus == .notDetermined { manager.requestAlwaysAuthorization() }
            call.reject("always-location-not-granted")
            return
        }
        guard let dutyDate = call.getString("dutyDate"), let regions = call.getArray("regions") as? [JSObject] else {
            call.reject("not-configured")
            return
        }
        if regions.count > 20 {
            call.reject("too-many-sites")
            return
        }
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        for region in regions {
            guard let jobId = region["jobId"] as? String,
                  let latitude = region["latitude"] as? Double,
                  let longitude = region["longitude"] as? Double else { continue }
            let radius = max(150, region["radiusMeters"] as? Double ?? 150)
            let circle = CLCircularRegion(center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude), radius: radius, identifier: jobId)
            circle.notifyOnEntry = true
            circle.notifyOnExit = true
            manager.startMonitoring(for: circle)
        }
        defaults.set(dutyDate, forKey: armedKey)
        call.resolve(["armed": true, "coordinatesPersisted": false])
    }

    @objc func disarm(_ call: CAPPluginCall) {
        for region in manager.monitoredRegions { manager.stopMonitoring(for: region) }
        manager.allowsBackgroundLocationUpdates = false
        manager.showsBackgroundLocationIndicator = false
        defaults.removeObject(forKey: armedKey)
        call.resolve(["armed": false])
    }

    @objc func getPendingEvents(_ call: CAPPluginCall) {
        call.resolve(["events": defaults.array(forKey: queueKey) ?? []])
    }

    @objc func ackEvents(_ call: CAPPluginCall) {
        defaults.removeObject(forKey: queueKey)
        call.resolve()
    }

    @objc func saveToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token") else {
            call.reject("missing-token")
            return
        }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "microsoft"
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = Data(token.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecSuccess { call.resolve() } else { call.reject("secure-storage-unavailable") }
    }

    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        record(region: region, transition: "enter")
    }

    public func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        record(region: region, transition: "exit")
    }

    private func record(region: CLRegion, transition: String) {
        guard let armed = defaults.string(forKey: armedKey) else { return }
        if armed != chicagoDate() {
            for existing in manager.monitoredRegions { manager.stopMonitoring(for: existing) }
            defaults.removeObject(forKey: armedKey)
            manager.allowsBackgroundLocationUpdates = false
            manager.showsBackgroundLocationIndicator = false
            return
        }
        var queue = defaults.array(forKey: queueKey) as? [[String: Any]] ?? []
        queue.append([
            "nativeEventId": UUID().uuidString,
            "jobId": region.identifier,
            "transition": transition,
            "occurredAt": ISO8601DateFormatter().string(from: Date())
        ])
        defaults.set(queue, forKey: queueKey)
    }

    private func chicagoDate() -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "America/Chicago")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}
