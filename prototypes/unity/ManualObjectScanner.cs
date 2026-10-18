using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

// Manual Fallback if automatic bounding box detection fails. 
// This script allows the user to manually define a bounding box by 
// tapping two points on a detected plane
// good for when depth fails (shiny objects, low light)

public class ManualBoundingBox : MonoBehaviour
{
    [SerializeField] private ARRaycastManager raycastManager;
    [SerializeField] private GameObject boundingBoxPrefab;

    private GameObject box;
    private List<ARRaycastHit> hits = new List<ARRaycastHit>();
    private Vector3? p1 = null;
    private Vector3? p2 = null;

    void Update()
    {
        if (Input.touchCount == 0)
            return;

        Touch t = Input.GetTouch(0);
        if (t.phase == TouchPhase.Began)
            HandleTap(t.position);
    }

    private void HandleTap(Vector2 pos)
    {
        if (!raycastManager.Raycast(pos, hits, TrackableType.PlaneWithinPolygon))
            return;

        Vector3 world = hits[0].pose.position;

        if (p1 == null)
        {
            p1 = world;
        }
        else if (p2 == null)
        {
            p2 = world;
            CreateBox();
        }
        else
        {
            p1 = world;
            p2 = null;
        }
    }

    private void CreateBox()
    {
        Vector3 center = (p1.Value + p2.Value) * 0.5f;
        float width = Vector3.Distance(p1.Value, p2.Value);

        if (box == null)
            box = Instantiate(boundingBoxPrefab);

        box.transform.position = center;
        box.transform.localScale = new Vector3(width, width, width * 0.5f);
    }
}
