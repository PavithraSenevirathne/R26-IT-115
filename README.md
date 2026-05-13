# Cinnamon Tree Management & Research System

Git Repository : https://github.com/PavithraSenevirathne/R26-IT-115.git

This repository contains the source code, models, and documentation for a comprehensive AI-driven research project focused on the cultivation and management of Cinnamon trees. The system integrates computer vision, machine learning, natural language processing, and fuzzy logic to assist farmers in monitoring plant health, detecting pests, receiving fertilizer recommendations, and determining optimal harvest times.

## 1. Disease Detection and Explainability (XAI)
This module focuses on identifying diseases affecting cinnamon plants using image classification, complete with explainable AI (XAI) for model transparency and user trust.

* **Data Processing**: Image datasets of healthy and diseased cinnamon plants are processed through Class Mapping, Class Weight Balancing, and Train-only Data Augmentation.
* **Model Architecture**: Utilizes `MobileNetV3Small` coupled with a custom Classification Head.
* **Training Pipeline**: A structured two-phase approach involving initial Phase 1 Training followed by Phase 2 Fine-Tuning.
* **Evaluation & Deployment**: Models undergo rigorous evaluation and are exported to TFLite formats for efficient edge deployment.
* **Explainability & Output**: Integrates **GradCAM** (Gradient-weighted Class Activation Mapping) to generate heatmaps explaining the model's reasoning. The final inference outputs the **Disease Class**, **Confidence Score**, **Severity Level**, and a visual **Heatmap**.

## 2. Pest Detection & Localization
A lightweight object detection module specifically designed to identify and localize pests on cinnamon plants, optimized for edge devices.

* **Dataset Preparation**: Utilizes a curated pest image collection with precise bounding box annotations.
* **Model Architecture**: Implements `YOLOv11 Nano` for high-speed, low-resource inference.
* **Evaluation Metrics**: Model performance is evaluated using standard object detection metrics: mAP@50, Precision, and Recall.
* **Edge Optimization**: Incorporates model compression techniques to ensure smooth performance on low-end Android devices.
* **Output**: Provides real-time detection yielding the **Pest Type** alongside its respective **Bounding Box**.

## 3. Intelligent Fertilizer Recommendation System
An interactive chatbot system that acts as a virtual agronomist, providing personalized fertilizer dosage and recommendations based on farmer inputs.

* **Conversational Interface (Rasa)**: Powered by **Rasa Open Source**, managing NLU, Intent & Entity extraction, and Dialogue Management (utilizing `domain.yml` and NLU training data).
* **Backend Processing**: A Custom Action Server bridges the Rasa chat interface with the decision-making engine.
* **Decision Engine**: Features a **Custom Fuzzy Logic Engine** that combines a Fuzzy Rule Base, Fuzzy Input Variables, and a specialized Cinnamon Fertilizer Knowledge Base.
* **Output**: Delivers actionable **Fertilizer Recommendations** and precise **Dosage Guidance** directly to the farmer's mobile chat interface.

# 4. Multimodal Harvest Readiness Assessment
A multimodal fusion system that combines physical measurements, visual bark features,
and optional field notes to determine the optimal time for cinnamon harvesting.

* **Numerical Pipeline**: Processes physical measurements (shoot height, trunk
  circumference, shoot age, leaf count) and qualitative attributes (bark color,
  bark texture, leaf color, shoot straightness) using a **Gradient Boosting +
  Random Forest Voting Classifier (LightGBM ensemble)** with Ordinal Encoding to
  output a calculated *Readiness Score with class probabilities*.

* **Visual Pipeline**: Processes up to 3 multi-angle trunk images (Front, Side L,
  Side R) through image preprocessing and a **CNN Ensemble** to output
  *Visual Texture Classification*.

* **Notes Pipeline**: Accepts optional free-text or voice-recorded field
  observations, parsed and fused into the feature set via a natural language
  **Parse API** to enrich prediction context.

* **Score Fusion**: A dedicated Score Fusion Module synthesizes the continuous
  Readiness Score with the CNN Texture Classification and parsed notes into a
  unified confidence distribution across all three classes.

* **Output**: Yields a definitive **Harvest Readiness Decision**, categorizing
  the shoot's status as **Ready**, **Borderline**, or **Not Ready** — accompanied
  by model confidence percentages, agronomic reasoning, and CCGI-aligned
  next-step guidelines.

## 5. User Interface (Mobile Application)
The farmer-facing frontend is a cross-platform mobile application developed using **React Native**, designed to run smoothly on diverse mobile hardware, including low-end Android devices.

* **Unified Dashboard**: Serves as the central hub for the farmer, integrating all four deep learning and AI modules.
* **Camera Integration**: Allows farmers to seamlessly capture and upload plant images for instant Disease Analysis (Module 1) and Pest Detection (Module 2), displaying bounding boxes and GradCAM heatmaps natively.
* **Chat UI**: Hosts the mobile chat interface communicating directly with the Rasa backend for real-time fertilizer consultations (Module 3).
* **Multimodal Inputs**: Provides forms and camera inputs to collect both numerical data and bark images, presenting the final harvest readiness decisions clearly (Module 4).
