using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

public class DynamicBoundingBox : MonoBehaviour
{
    [Header("AR Managers")]
    [SerializeField] private ARRaycastManager raycastManager;
    [SerializeField] private ARPlaneManager planeManager;

    [Header("Bounding Box")]
    [SerializeField] private GameObject boundingBoxPrefab;
    [SerializeField] private float defaultDepth = 0.05f; // 5 cm thick

    private GameObject currentBox;
    private List<ARRaycastHit> hits = new List<ARRaycastHit>();

    // store two points to define rectangle on the plane
    private Vector3? firstPointWorld = null;
    private Vector3? secondPointWorld = null;

    void Update()
    {
        if (Input.touchCount == 0)
            return;

        Touch touch = Input.GetTouch(0);

        if (touch.phase == TouchPhase.Began)
        {
            HandleTouch(touch.position);
        }
    }

    private void HandleTouch(Vector2 screenPosition)
    {
        // Raycast against planes
        if (!raycastManager.Raycast(screenPosition, hits, TrackableType.PlaneWithinPolygon))
            return;

        var hit = hits[0];
        var hitPose = hit.pose;

        // Ensure we have a plane
        ARPlane plane = planeManager.GetPlane(hit.trackableId);
        if (plane == null)
            return;

        Vector3 worldPoint = hitPose.position;

        if (firstPointWorld == null)
        {
            // First corner of the bounding rectangle
            firstPointWorld = worldPoint;
        }
        else if (secondPointWorld == null)
        {
            // Second corner of the bounding rectangle
            secondPointWorld = worldPoint;

            // create or update the box
            CreateOrUpdateBox(plane);
        }
        else
        {
            // Reset: start new box definition
            firstPointWorld = worldPoint;
            secondPointWorld = null;
        }
    }

    private void CreateOrUpdateBox(ARPlane plane)
    {
        if (firstPointWorld == null || secondPointWorld == null)
            return;

        Vector3 p1 = firstPointWorld.Value;
        Vector3 p2 = secondPointWorld.Value;

        // Center is midpoint between the two points
        Vector3 center = (p1 + p2) * 0.5f;

        // Width and height are distances along the plane
        float width = Vector3.Distance(
            new Vector3(p1.x, plane.transform.position.y, p1.z),
            new Vector3(p2.x, plane.transform.position.y, p2.z)
        );

        // For height - approximate using vertical difference in world space
        float height = Mathf.Abs(p1.y - p2.y);
        if (height < 0.01f)
        {
            // If vertical difference is tiny (e.g., both taps on top surface),
            //  use width as a proxy for height (square-ish box).
            height = width;
        }

        // Depth is fixed for now
        float depth = defaultDepth;

        Vector3 scale = new Vector3(width, height, depth);

        if (currentBox == null)
        {
            currentBox = Instantiate(boundingBoxPrefab, center, Quaternion.identity);
        }

        currentBox.transform.position = center;

        // Align box with plane’s normal so it sits correctly on the surface
        currentBox.transform.rotation = Quaternion.LookRotation(plane.normal, Vector3.up);

        currentBox.transform.localScale = scale;
    }
}
