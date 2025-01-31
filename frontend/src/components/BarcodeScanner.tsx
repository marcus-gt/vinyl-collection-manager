import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Box, Text, Button, Loader, Select } from '@mantine/core';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  isScanning: boolean;
  isLoading: boolean;
}

interface CameraDevice {
  id: string;
  label: string;
}

export function BarcodeScanner({ onScan, isScanning, isLoading }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const startScanning = async (cameraId: string) => {
    if (!scannerRef.current) return;

    try {
      await scannerRef.current.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.0,
          videoConstraints: {
            facingMode: { exact: "environment" },
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 }
          }
        },
        (decodedText) => {
          console.log("Barcode detected:", decodedText);
          onScan(decodedText);
          if (scannerRef.current) {
            scannerRef.current.pause(true);
            setIsPaused(true);
          }
        },
        (errorMessage) => {
          if (!errorMessage.includes("QR code parse error") && 
              !errorMessage.includes("No MultiFormat Readers were able to detect the code")) {
            console.log("Scanner error:", errorMessage);
          }
        }
      );
      setIsRunning(true);
      setIsPaused(false);
      console.log("Camera started with environment facing mode");
    } catch (err) {
      console.error("Failed to start camera:", err);
      try {
        await scannerRef.current.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.0,
            videoConstraints: {
              facingMode: "environment",
              width: { min: 640, ideal: 1280, max: 1920 },
              height: { min: 480, ideal: 720, max: 1080 }
            }
          },
          (decodedText) => {
            console.log("Barcode detected:", decodedText);
            onScan(decodedText);
            if (scannerRef.current) {
              scannerRef.current.pause(true);
              setIsPaused(true);
            }
          },
          (errorMessage) => {
            if (!errorMessage.includes("QR code parse error") && 
                !errorMessage.includes("No MultiFormat Readers were able to detect the code")) {
              console.log("Scanner error:", errorMessage);
            }
          }
        );
        setIsRunning(true);
        setIsPaused(false);
        console.log("Camera started with fallback mode");
      } catch (fallbackErr) {
        console.error("Failed to start camera with fallback:", fallbackErr);
        setError("Failed to start camera. Please try again.");
      }
    }
  };

  useEffect(() => {
    const initializeScanner = async () => {
      if (isScanning && !scannerRef.current) {
        console.log("Initializing scanner...");
        try {
          scannerRef.current = new Html5Qrcode("reader");
          console.log("Scanner created");

          const devices = await Html5Qrcode.getCameras();
          console.log("Available cameras:", devices);
          setCameras(devices);

          // Try to find a back camera first
          const backCamera = devices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('rear')
          );
          
          // Set the default camera
          const defaultCamera = backCamera || devices[0];
          if (defaultCamera) {
            setSelectedCamera(defaultCamera.id);
            await startScanning(defaultCamera.id);
          } else {
            setError("No cameras found. Please make sure your device has a camera and it's not in use.");
          }
        } catch (err) {
          console.error("Failed to initialize scanner:", err);
          if (err instanceof Error) {
            if (err.message.includes("NotAllowedError")) {
              setError("Camera access was denied. Please allow camera access in your browser settings.");
            } else if (err.message.includes("NotFoundError")) {
              setError("No camera found. Please make sure your device has a camera and it's not in use.");
            } else if (err.message.includes("NotReadableError")) {
              setError("Camera is in use by another application. Please close other apps using the camera.");
            } else {
              setError("Failed to initialize scanner. Please try again.");
            }
          }
        }
      }
    };

    initializeScanner();

    return () => {
      console.log("Cleaning up scanner...");
      if (scannerRef.current && isRunning) {
        scannerRef.current.stop()
          .then(() => {
            console.log("Scanner stopped");
            scannerRef.current = null;
            setIsRunning(false);
            setIsPaused(false);
            setError(null);
          })
          .catch((err) => {
            console.error("Error stopping scanner:", err);
          });
      }
    };
  }, [isScanning]);

  // Effect to handle loading state changes
  useEffect(() => {
    if (!isLoading && isPaused) {
      // When loading finishes and we were paused, we can allow next scan
      setIsPaused(true);
    }
  }, [isLoading]);

  const handleNextScan = async () => {
    if (scannerRef.current && cameras.length > 0) {
      try {
        await scannerRef.current.resume();
        setIsPaused(false);
      } catch (err) {
        console.error("Failed to resume scanner:", err);
        // If resume fails, try to restart the scanner
        await startScanning(cameras[0].id);
      }
    }
  };

  const handleCameraChange = async (cameraId: string) => {
    setSelectedCamera(cameraId);
    if (scannerRef.current && isRunning) {
      await scannerRef.current.stop();
      await startScanning(cameraId);
    }
  };

  if (error) {
    return (
      <Box 
        pos="relative"
        style={{ 
          width: '100%', 
          height: '300px',
          backgroundColor: '#f0f0f0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}
      >
        <Text c="red" mb="md" ta="center">{error}</Text>
        <Button 
          onClick={() => {
            console.log("Retrying scanner...");
            setError(null);
            if (scannerRef.current && isRunning) {
              scannerRef.current.stop()
                .then(() => {
                  console.log("Scanner stopped");
                  scannerRef.current = null;
                  setIsRunning(false);
                  setIsPaused(false);
                })
                .catch((err) => {
                  console.error("Error stopping scanner:", err);
                });
            }
          }}
        >
          Try Again
        </Button>
      </Box>
    );
  }

  return (
    <Box 
      pos="relative"
      style={{ 
        width: '100%', 
        height: '400px', // Fixed height instead of viewport-based
        backgroundColor: '#f0f0f0',
        overflow: 'hidden',
        maxWidth: '100vw',
        margin: '0 auto',
        position: 'relative'
      }}
    >
      {cameras.length > 1 && (
        <Box 
          mb="sm" 
          style={{ 
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1000,
            width: 'auto',
            minWidth: 150,
            maxWidth: 'calc(100vw - 32px)' // Prevent overflow on mobile
          }}
        >
          <Select
            placeholder="📷 Camera"
            data={cameras.map(camera => ({
              value: camera.id,
              label: camera.label || `Camera ${camera.id}`
            }))}
            value={selectedCamera}
            onChange={(value) => value && handleCameraChange(value)}
            disabled={!isRunning || isPaused}
            variant="filled"
            size="xs"
            styles={{
              root: { backgroundColor: 'transparent' },
              input: {
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                color: 'white',
                border: 'none',
                '&:focus': {
                  border: 'none'
                }
              },
              dropdown: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                border: 'none',
                maxWidth: 'calc(100vw - 32px)' // Prevent overflow on mobile
              },
              option: {
                color: 'white',
                '&[data-selected]': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)'
                },
                '&[data-hovered]': {
                  backgroundColor: 'rgba(255, 255, 255, 0.2)'
                }
              }
            }}
          />
        </Box>
      )}
      <div 
        id="reader" 
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'absolute',
          top: 0,
          left: 0
        }}
      />
      <Box mt="md" style={{ textAlign: 'center' }}>
        {isPaused && !isLoading && (
          <Button 
            onClick={handleNextScan}
            variant="filled"
            color="blue"
          >
            Next Scan
          </Button>
        )}
        {isLoading && (
          <Box style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
            <Loader size="sm" />
            <Text>Looking up record...</Text>
          </Box>
        )}
      </Box>
      {cameras.length > 0 && isRunning && !isPaused && !isLoading && (
        <Text 
          pos="absolute" 
          bottom={10} 
          left="50%" 
          style={{ 
            transform: 'translateX(-50%)',
            color: 'white',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: '5px 10px',
            borderRadius: '4px'
          }}
        >
          Camera active - Center the barcode in view
        </Text>
      )}
    </Box>
  );
} 
