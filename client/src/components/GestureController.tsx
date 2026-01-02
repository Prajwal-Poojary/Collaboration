import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as handpose from '@tensorflow-models/handpose';
// @ts-ignore
import * as fp from 'fingerpose';

interface GestureControllerProps {
    stream: MediaStream | null;
    isVideoOn: boolean;
    onGestureDetect: (gestureName: string) => void;
    isEnabled: boolean;
    onModelLoaded?: () => void;
}

const GestureController: React.FC<GestureControllerProps> = ({ stream, isVideoOn, onGestureDetect, isEnabled, onModelLoaded }) => {
    const videoRef = useRef<HTMLVideoElement>(document.createElement('video'));
    const [model, setModel] = useState<handpose.HandPose | null>(null);
    const requestRef = useRef<number | null>(null);
    const lastGestureTime = useRef<number>(0);
    const onGestureDetectRef = useRef(onGestureDetect);

    useEffect(() => {
        onGestureDetectRef.current = onGestureDetect;
    }, [onGestureDetect]);

    // Initialize Gesture Estimator
    const [estimator, setEstimator] = useState<any>(null);

    useEffect(() => {
        const loadModel = async () => {
            // Load the MediaPipe handpose model.
            console.log('Loading handpose model...');
            try {
                await tf.ready();
                const loadedModel = await handpose.load();
                setModel(loadedModel);
                console.log('Handpose model loaded.');

                // Define Gestures
                // Thumbs Up
                const thumbsUp = new fp.GestureDescription('thumbs_up');
                thumbsUp.addCurl(fp.Finger.Thumb, fp.FingerCurl.NoCurl, 1.0);
                thumbsUp.addDirection(fp.Finger.Thumb, fp.FingerDirection.VerticalUp, 1.0);
                thumbsUp.addDirection(fp.Finger.Thumb, fp.FingerDirection.DiagonalUpLeft, 0.9);
                thumbsUp.addDirection(fp.Finger.Thumb, fp.FingerDirection.DiagonalUpRight, 0.9);
                for (let finger of [fp.Finger.Index, fp.Finger.Middle, fp.Finger.Ring, fp.Finger.Pinky]) {
                    thumbsUp.addCurl(finger, fp.FingerCurl.FullCurl, 1.0);
                    thumbsUp.addCurl(finger, fp.FingerCurl.HalfCurl, 0.9);
                }

                // Open Palm (Raise Hand)
                const openPalm = new fp.GestureDescription('open_palm');
                for (let finger of [fp.Finger.Thumb, fp.Finger.Index, fp.Finger.Middle, fp.Finger.Ring, fp.Finger.Pinky]) {
                    openPalm.addCurl(finger, fp.FingerCurl.NoCurl, 1.0);
                }

                // Closed Fist (Mute) - Optional
                // For now let's focus on ThumbsUp and Raise Hand as they are distinct.
                // Fist might be too easy to trigger accidentally?
                // Let's add it but require high confidence.
                const closedFist = new fp.GestureDescription('closed_fist');
                for (let finger of [fp.Finger.Thumb, fp.Finger.Index, fp.Finger.Middle, fp.Finger.Ring, fp.Finger.Pinky]) {
                    closedFist.addCurl(finger, fp.FingerCurl.FullCurl, 1.0);
                    closedFist.addCurl(finger, fp.FingerCurl.HalfCurl, 0.9);
                }


                // Victory (Video Toggle)
                const victory = new fp.GestureDescription('victory');
                victory.addCurl(fp.Finger.Index, fp.FingerCurl.NoCurl, 1.0);
                victory.addCurl(fp.Finger.Middle, fp.FingerCurl.NoCurl, 1.0);
                victory.addCurl(fp.Finger.Ring, fp.FingerCurl.FullCurl, 1.0);
                victory.addCurl(fp.Finger.Ring, fp.FingerCurl.HalfCurl, 0.9);
                victory.addCurl(fp.Finger.Pinky, fp.FingerCurl.FullCurl, 1.0);
                victory.addCurl(fp.Finger.Pinky, fp.FingerCurl.HalfCurl, 0.9);

                // OK Sign (Reaction)
                const okSign = new fp.GestureDescription('ok_sign');
                okSign.addCurl(fp.Finger.Thumb, fp.FingerCurl.NoCurl, 1.0);
                okSign.addCurl(fp.Finger.Index, fp.FingerCurl.HalfCurl, 1.0); // Curve to meet thumb
                for (let finger of [fp.Finger.Middle, fp.Finger.Ring, fp.Finger.Pinky]) {
                    okSign.addCurl(finger, fp.FingerCurl.NoCurl, 1.0);
                    okSign.addDirection(finger, fp.FingerDirection.VerticalUp, 1.0);
                }

                setEstimator(new fp.GestureEstimator([thumbsUp, openPalm, closedFist, victory, okSign]));
                if (onModelLoaded) onModelLoaded();

            } catch (err) {
                console.error('Failed to load handpose model', err);
            }
        };

        if (isEnabled) {
            loadModel();
        }
    }, [isEnabled]);

    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.error("Error playing invisible video", e));
        }
    }, [stream]);

    const detect = async () => {
        if (
            isEnabled &&
            model &&
            estimator &&
            videoRef.current &&
            videoRef.current.readyState === 4 &&
            isVideoOn
        ) {
            // Detect hands
            const predictions = await model.estimateHands(videoRef.current);

            if (predictions.length > 0) {
                const gestureEstimations = estimator.estimate(predictions[0].landmarks, 8.5); // 8.5 is min confidence

                if (gestureEstimations.gestures.length > 0) {

                    // Find gesture with highest confidence
                    const gesture = gestureEstimations.gestures.reduce((p: any, c: any) => {
                        return (p.confidence > c.confidence) ? p : c;
                    });

                    // Debounce
                    const now = Date.now();
                    if (now - lastGestureTime.current > 1500) { // 1.5s debounce
                        console.log("Gesture Detected:", gesture.name, gesture.confidence);
                        onGestureDetectRef.current(gesture.name);
                        lastGestureTime.current = now;
                    }
                }
            }
        }

        requestRef.current = requestAnimationFrame(detect);
    };

    useEffect(() => {
        if (isEnabled && model && isVideoOn) {
            requestRef.current = requestAnimationFrame(detect);
        } else if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        }
    }, [isEnabled, model, isVideoOn]);

    return null; // This component is logic-only
};

export default GestureController;
