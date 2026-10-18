using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using UnityEngine.UI;

// use AR Foundation + Depth API to estimate object extents in front of camera

public class AutoObjectScanner : MonoBehaviour
{
    [Header("AR")]
    [SerializeField] private ARCameraManager cameraManager;
    [SerializeField] private ARRaycastManager raycastManager;

    [Header("Bounding Box")]
    [SerializeField] private GameObject boundingBoxPrefab;
    private GameObject activeBox;

    [Header("Scan UI")]
    [SerializeField] private Image scanProgressImage;
    private float scanTimer = 0f;
    private const float scanDuration = 3f;

    private bool scanning = false;

    // Depth data buffer
    private XRCpuImage depthImage;

    void Update()
    {
        if (!scanning)
        {
            // Player must center object → we check if depth is stable
            if (TryStartScan())
            {
                scanning = true;
                scanTimer = 0f;
            }
            return;
        }

        // Update scan timer
        scanTimer += Time.deltaTime;
        scanProgressImage.fillAmount = scanTimer / scanDuration;

        // Update bounding box continuously
        UpdateBoundingBoxFromDepth();

        if (scanTimer >= scanDuration)
        {
            FinishScan();
        }
    }

    private bool TryStartScan()
    {
        // Check if depth is available
        if (!cameraManager.TryAcquireLatestCpuImage(out depthImage))
            return false;

        depthImage.Dispose();
        return true;
    }

    private void UpdateBoundingBoxFromDepth()
    {
        if (!cameraManager.TryAcquireLatestCpuImage(out depthImage))
            return;

        // Convert depth image to world points
        var points = ExtractDepthPoints(depthImage);
        depthImage.Dispose();

        if (points.Count < 10)
            return;

        // Compute bounding box extents
        Bounds bounds = ComputeBounds(points);

        if (activeBox == null)
            activeBox = Instantiate(boundingBoxPrefab);

        activeBox.transform.position = bounds.center;
        activeBox.transform.localScale = bounds.size;
    }

    private List<Vector3> ExtractDepthPoints(XRCpuImage depth)
    {
        List<Vector3> worldPoints = new List<Vector3>();

        XRCpuImage.ConversionParams cp = new XRCpuImage.ConversionParams
        {
            inputRect = new RectInt(0, 0, depth.width, depth.height),
            outputDimensions = new Vector2Int(depth.width, depth.height),
            outputFormat = TextureFormat.RFloat,
            transformation = XRCpuImage.Transformation.None
        };

        int dataSize = depth.GetConvertedDataSize(cp);
        var buffer = new NativeArray<byte>(dataSize, Allocator.Temp);
        depth.Convert(cp, buffer);

        // Sample center region only (reduces noise)
        int step = 10;
        for (int y = depth.height / 3; y < 2 * depth.height / 3; y += step)
        {
            for (int x = depth.width / 3; x < 2 * depth.width / 3; x += step)
            {
                int index = (y * depth.width + x) * sizeof(float);
                float depthMeters = System.BitConverter.ToSingle(buffer.ToArray(), index);

                if (depthMeters <= 0.1f || depthMeters > 3f)
                    continue;

                Vector3 screenPoint = new Vector3(
                    (float)x / depth.width,
                    (float)y / depth.height,
                    depthMeters
                );

                Vector3 worldPoint = Camera.main.ViewportToWorldPoint(screenPoint);
                worldPoints.Add(worldPoint);
            }
        }

        buffer.Dispose();
        return worldPoints;
    }

    private Bounds ComputeBounds(List<Vector3> pts)
    {
        Bounds b = new Bounds(pts[0], Vector3.zero);
        foreach (var p in pts)
            b.Encapsulate(p);
        return b;
    }

    private void FinishScan()
    {
        scanning = false;
        scanProgressImage.fillAmount = 0f;

        // TODO: Hook your game logic here
        Debug.Log("Object captured!");
    }
}
