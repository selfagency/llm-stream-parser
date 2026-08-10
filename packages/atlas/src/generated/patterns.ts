/**
 * Atlas pattern data — generated from snapshot. Do not edit by hand.
 *
 * These are readonly arrays of the frozen snapshot data. No runtime
 * dependency on @quietloudlab/ai-interaction-atlas.
 */

import type {
  Layer, AiTask, HumanTask, SystemTask,
  DataArtifactDefinition, ConstraintDefinition, TouchpointDefinition
} from './types.js';

export const META = {
  "description": "A comprehensive library of interaction patterns for designing human-centered AI systems.",
  "schema_version": "1.1.0",
  "title": "AI Interaction Atlas",
  "version": "1.0"
} as const;

export const LAYERS: readonly Layer[] = [
  {
    "color": "#4A8A3F",
    "description": "How the system perceives inputs from people and the environment, and converts them into usable signals and structured artifacts.",
    "guidance": {
      "red_flags": [
        "Assuming input is already clean or structured",
        "Ignoring noise, ambiguity, or missing context",
        "No provenance (unclear sources / missing grounding)"
      ],
      "typical_position": "Start of flow (or any time new input enters the system).",
      "when_to_use": "When handling raw inputs (text, files, audio, images, sensors) or converting unstructured content into structured forms."
    },
    "id": "layer_inbound",
    "label": "Sensing",
    "name": "Inbound",
    "role": "Sensing & Structuring",
    "slug": "inbound"
  },
  {
    "color": "#3D6B8F",
    "description": "Model reasoning, scoring, and deterministic business logic that decides what happens next.",
    "guidance": {
      "red_flags": [
        "Black-box decisions without an explanation path",
        "Undefined thresholds (confidence, risk, cost, eligibility)",
        "Unclear decision ownership (AI vs rules vs human)"
      ],
      "typical_position": "Middle of flow (can repeat multiple times).",
      "when_to_use": "When the system must interpret signals, compare options, apply rules, verify constraints, or make decisions under uncertainty."
    },
    "id": "layer_internal",
    "label": "Reasoning",
    "name": "Internal",
    "role": "Reasoning & Deciding",
    "slug": "internal"
  },
  {
    "color": "#8F3D3D",
    "description": "How the system produces outputs—content, recommendations, summaries, transformations—and communicates them to people or other systems.",
    "guidance": {
      "red_flags": [
        "Ungrounded outputs (no citations, weak linkage to evidence)",
        "Overwhelming detail with no controllable level-of-detail",
        "No affordance for correction, editing, or safe fallback"
      ],
      "typical_position": "End of a loop or step (often followed by user response).",
      "when_to_use": "When presenting results, generating or transforming content, creating artifacts, or preparing outputs for downstream systems."
    },
    "id": "layer_outbound",
    "label": "Expressing",
    "name": "Outbound",
    "role": "Expressing & Creating",
    "slug": "outbound"
  },
  {
    "color": "#8F6E3D",
    "description": "Closed-loop behavior over time: actions, feedback, adaptation, monitoring, and state updates (simulate → plan → act → observe → update).",
    "guidance": {
      "red_flags": [
        "Ignoring feedback signals (explicit or implicit)",
        "No rollback/stop mechanism or rate limits (runaway loops)",
        "Model drift without monitoring + triggers",
        "Unsafe actions without human control points"
      ],
      "typical_position": "Continuous loop or background lifecycle.",
      "when_to_use": "When the system acts in an environment, adapts from feedback, runs experiments, maintains state across sessions, or monitors drift/performance."
    },
    "id": "layer_interactive",
    "label": "Acting",
    "name": "Interactive",
    "role": "Acting & Learning",
    "slug": "interactive"
  }
] as const;

export const AI_TASKS: readonly AiTask[] = [
  {
    "capabilities": [
      {
        "example": "Camera identifying and boxing every vehicle entering a parking lot",
        "name": "Object Detection",
        "tag": "object-detection"
      },
      {
        "example": "Tracking shoulder, elbow, and wrist positions during a pushup",
        "name": "Keypoint Detection",
        "tag": "keypoint-detection"
      },
      {
        "example": "Finding cats in photos without ever training on cat images",
        "name": "Zero-Shot Detection",
        "tag": "zero-shot-object-detection"
      },
      {
        "example": "Video conferencing tool unmuting a mic when user starts speaking",
        "name": "Voice Activity Detection",
        "tag": "voice-activity-detection"
      },
      {
        "example": "identifying objects, sounds, and text across uploaded images, audio, and documents",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Locate and identify objects in image, video, audio, or other data.",
    "example_usage": "Spotting pedestrians in a video feed.",
    "id": "task_detect",
    "implementation_notes": {
      "data_requirements": "medium",
      "human_oversight": "optional",
      "maturity": "established",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_video",
            "label": "Video"
          },
          {
            "id": "data_video_stream",
            "label": "Video Stream"
          },
          {
            "id": "data_point_cloud",
            "label": "LiDAR/3D"
          },
          {
            "id": "data_multimodal",
            "label": "AV Stream"
          },
          {
            "id": "data_audio_stream",
            "label": "Audio Stream"
          }
        ],
        "required": [
          {
            "id": "data_image",
            "label": "Image"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Confidence"
          },
          {
            "id": "data_heatmap",
            "label": "Attention Map"
          }
        ],
        "primary": {
          "id": "data_bbox",
          "isArray": true,
          "label": "Detections"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Detect",
    "relations": [
      {
        "reason": "Detections are the raw signals that monitoring systems aggregate.",
        "strength": "strong",
        "target_id": "task_monitor",
        "type": "enables"
      },
      {
        "reason": "Detected objects (crops) are often passed to a classifier for finer detail.",
        "strength": "medium",
        "target_id": "task_classify",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Detection provides regions of interest for detailed segmentation.",
        "strength": "medium",
        "target_id": "task_segment",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Do not attempt to summarize bounding box coordinates directly as prose.",
        "strength": "strong",
        "target_id": "task_synthesize",
        "type": "incompatible_with"
      }
    ],
    "slug": "detect",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Using in safety-critical applications without human verification"
      ],
      "risk": "False negatives and false positives",
      "tip": "Visualize bounding boxes with confidence scores"
    }
  },
  {
    "capabilities": [
      {
        "example": "Asking 'What's the warranty period?' and getting '2 years' from a 50-page manual",
        "name": "Question Answering",
        "tag": "question-answering"
      },
      {
        "example": "Asking 'Which region had highest sales in Q3?' from a spreadsheet table",
        "name": "Table Question Answering",
        "tag": "table-question-answering"
      },
      {
        "example": "Getting 'March 15, 2025' when asking 'When does this contract expire?' from a PDF",
        "name": "Document Question Answering",
        "tag": "document-question-answering"
      },
      {
        "example": "Highlighting every name, company, and date in a legal document",
        "name": "Token Classification",
        "tag": "token-classification"
      },
      {
        "example": "Asking 'How many people are wearing hats?' about a crowd photo",
        "name": "Visual Question Answering",
        "tag": "visual-question-answering"
      },
      {
        "example": "Producing the total spend on grocery items vs candy from a receipt photo",
        "name": "Image-Text-to-Text",
        "tag": "image-text-to-text"
      },
      {
        "example": "Pulling action items assigned to a specific person from a meeting recording.",
        "name": "Audio-Text-to-Text",
        "tag": "audio-text-to-text"
      },
      {
        "example": "Asking 'When does the speaker mention pricing?' on a 2-hour webinar video",
        "name": "Video-Text-to-Text",
        "tag": "video-text-to-text"
      }
    ],
    "elevator_pitch": "Pull specific data fields from documents they already have.",
    "example_usage": "Getting answers from a document.",
    "id": "task_extract",
    "implementation_notes": {
      "data_requirements": "small",
      "human_oversight": "optional",
      "maturity": "established",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_text",
            "label": "Query"
          },
          {
            "id": "data_markup",
            "label": "HTML/XML"
          },
          {
            "id": "data_image",
            "label": "Visual Context"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "label": "Source Content"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_text",
            "label": "Source Span"
          }
        ],
        "primary": {
          "id": "data_json",
          "label": "Extracted Value"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Extract",
    "relations": [
      {
        "reason": "LLM extraction is prone to hallucination; always verify critical data against source.",
        "strength": "strong",
        "target_id": "task_verify",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Structuring unstructured data is the primary prerequisite for database storage.",
        "strength": "strong",
        "target_id": "system_create_db",
        "type": "enables"
      },
      {
        "reason": "Extracted structured fields (invoice type, support category) are often classified for routing.",
        "strength": "medium",
        "target_id": "task_classify",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "extract",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Extracting from unreliable sources without verification"
      ],
      "risk": "Hallucinated values",
      "tip": "Highlight source text to show provenance"
    }
  },
  {
    "capabilities": [
      {
        "example": "Phone camera measuring that your wall is 10 feet away for AR picture frame placement",
        "name": "Depth Estimation",
        "tag": "depth-estimation"
      },
      {
        "example": "Motion capture detecting actor's joint positions for animation rigging",
        "name": "Keypoint Detection",
        "tag": "keypoint-detection"
      },
      {
        "example": "Extracting geometric features to estimate room dimensions from a single photo",
        "name": "Pose Estimation",
        "tag": "image-feature-extraction"
      }
    ],
    "elevator_pitch": "Measure distances, depths, and dimensions from images or sensors.",
    "example_usage": "Estimating depth in an image.",
    "id": "task_estimate",
    "implementation_notes": {
      "data_requirements": "large",
      "human_oversight": "optional",
      "maturity": "emerging",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_sensor_stream",
            "label": "Sensor Data"
          }
        ],
        "required": [
          {
            "id": "data_image",
            "label": "Input Media"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Confidence"
          },
          {
            "id": "data_optical_flow",
            "label": "Motion Vectors"
          }
        ],
        "primary": {
          "id": "data_depth_map",
          "label": "Depth/Heat Map"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Estimate",
    "relations": [
      {
        "reason": "Spatial estimation (depth/distance) provides the world-model for planning paths.",
        "strength": "medium",
        "target_id": "task_plan",
        "type": "enables"
      },
      {
        "reason": "Depth information improves segmentation accuracy.",
        "strength": "medium",
        "target_id": "task_segment",
        "type": "enables"
      }
    ],
    "slug": "estimate",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Using in safety-critical navigation without sensor fusion"
      ],
      "risk": "Inaccuracy in edge cases",
      "tip": "Show range/uncertainty bounds"
    }
  },
  {
    "capabilities": [
      {
        "example": "Generating natural language explanation of classification decision with contributing factors",
        "name": "Text Generation",
        "tag": "text-generation"
      },
      {
        "example": "Answering 'Why was this flagged?' by retrieving the specific policy violation",
        "name": "Question Answering",
        "tag": "question-answering"
      },
      {
        "example": "Analyzing own historical workflows or agentic tool usage and generating a natural language summary",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Reveals the contributing factors behind a model's prediction.",
    "example_usage": "Highlighting which words in a resume caused the 'Rejection' classification.",
    "id": "task_explain",
    "implementation_notes": {
      "data_requirements": "small",
      "human_oversight": "none",
      "maturity": "emerging",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_image",
            "label": "Source Media"
          },
          {
            "id": "data_text",
            "label": "Source Text"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "label": "Model Output"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_text",
            "label": "Natural Language Explanation"
          }
        ],
        "primary": {
          "id": "data_heatmap",
          "label": "Attribution Map"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Explain / Interpret",
    "relations": [
      {
        "reason": "Users often need to know why an item was classified a certain way.",
        "strength": "strong",
        "target_id": "task_classify",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Explainability tools help humans make faster review decisions.",
        "strength": "strong",
        "target_id": "human_review",
        "type": "enables"
      }
    ],
    "slug": "explain",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Over-explaining low-stakes decisions"
      ],
      "risk": "False sense of causality",
      "tip": "Use highlighting to show correlation, not just causation. Consider post-hoc analysis tools like SHAP or LIME for showing which features contributed most."
    }
  },
  {
    "capabilities": [
      {
        "example": "Inventory system predicting when you will run out of an item in 3 weeks based on sales trends",
        "name": "Time Series Forecasting",
        "tag": "time-series-forecasting"
      }
    ],
    "elevator_pitch": "Predicts future values in a sequence based on historical trends.",
    "example_usage": "Predicting server load for the next 24 hours.",
    "id": "task_forecast",
    "implementation_notes": {
      "data_requirements": "large",
      "human_oversight": "optional",
      "maturity": "established",
      "typical_latency": "batch"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_config",
            "label": "Horizon"
          }
        ],
        "required": [
          {
            "id": "data_table",
            "label": "Historical Series"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Confidence Interval"
          }
        ],
        "primary": {
          "id": "data_trajectory",
          "label": "Forecast Line"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Forecast",
    "relations": [
      {
        "reason": "Forecasts (e.g., weather, stock) are the inputs for planning algorithms.",
        "strength": "strong",
        "target_id": "task_plan",
        "type": "enables"
      },
      {
        "reason": "Forecasts must be constantly checked against actuals to detect drift.",
        "strength": "medium",
        "target_id": "system_monitor_model",
        "type": "monitored_by"
      }
    ],
    "slug": "forecast",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Presenting forecasts as certainty"
      ],
      "risk": "Black swan events",
      "tip": "Always show confidence intervals (P90/P10)"
    }
  },
  {
    "capabilities": [
      {
        "example": "Wildlife camera logging whenever it sees a bear vs deer",
        "name": "Image Classification",
        "tag": "image-classification"
      },
      {
        "example": "Microphone monitor system sending a text if a smoke alarm is detected",
        "name": "Audio Classification",
        "tag": "audio-classification"
      },
      {
        "example": "Ring doorbell sending notification when it sees 'Package Delivery' vs 'Person Walking By",
        "name": "Video Classification",
        "tag": "video-classification"
      },
      {
        "example": "Zoom automatically switching to speaker view when someone starts talking",
        "name": "Voice Activity Detection",
        "tag": "voice-activity-detections"
      },
      {
        "example": "construction site camera alerting 'worker without hard hat'",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Identifies specific events or objects detected in continuous data streams.",
    "example_usage": "Listening for glass breaking sounds.",
    "id": "task_monitor",
    "implementation_notes": {
      "data_requirements": "medium",
      "human_oversight": "none",
      "maturity": "established",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_video_stream",
            "label": "Video Feed"
          },
          {
            "id": "data_audio_stream",
            "label": "Audio Feed"
          },
          {
            "id": "data_sensor_stream",
            "label": "Telemetry"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "label": "Stream Source"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_log",
            "label": "Event Log"
          }
        ],
        "primary": {
          "id": "data_signal",
          "label": "Event Trigger"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Monitor",
    "relations": [
      {
        "reason": "Detect identifies *where*, Monitor identifies *when* (and alerts).",
        "strength": "strong",
        "target_id": "task_detect",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "The primary output of monitoring is alerting a human or system.",
        "strength": "strong",
        "target_id": "system_notification",
        "type": "triggers"
      }
    ],
    "slug": "monitor",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "No user control over sensitivity"
      ],
      "risk": "Alert fatigue from false positives",
      "tip": "Group notifications and allow threshold adjustment"
    }
  },
  {
    "capabilities": [
      {
        "example": "Finding similar products in a catalog even when descriptions use different words",
        "name": "Feature Extraction",
        "tag": "feature-extraction"
      },
      {
        "example": "Reverse image search finding similar photos across your entire photo library",
        "name": "Image Feature Extraction",
        "tag": "image-feature-extraction"
      },
      {
        "example": "Searching 'how to reset password' and finding doc titled 'Account Recovery Steps",
        "name": "Sentence Similarity",
        "tag": "sentence-similarity"
      },
      {
        "example": "Finding scanned invoice by searching 'Acme Corp March invoice' across 10,000 scans",
        "name": "Visual Document Retrieval",
        "tag": "visual-document-retrieval"
      },
      {
        "example": "Searching Notion with 'Q3 planning' and finding relevant docs, images, and meeting notes",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Find relevant documents or items from large collections using semantic search.",
    "example_usage": "Semantic search over a knowledge base.",
    "id": "task_retrieve",
    "implementation_notes": {
      "data_requirements": "medium",
      "human_oversight": "none",
      "maturity": "established",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_embedding",
            "label": "Vector Query"
          },
          {
            "id": "data_knowledge_graph",
            "label": "Graph Context"
          },
          {
            "id": "data_image",
            "label": "Visual Query"
          }
        ],
        "required": [
          {
            "id": "data_text",
            "label": "Query"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Relevance Score"
          }
        ],
        "primary": {
          "id": "data_any",
          "isArray": true,
          "label": "Matches"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Retrieve",
    "relations": [
      {
        "reason": "Semantic retrieval requires an embedding model (Represent) to vectorize the query.",
        "strength": "strong",
        "target_id": "task_represent",
        "type": "requires_input_from"
      },
      {
        "reason": "The 'R' in RAG. Retrieval provides the grounded context for Generation.",
        "strength": "strong",
        "target_id": "task_generate",
        "type": "enables"
      },
      {
        "reason": "Raw retrieval results are often noisy; Ranking re-orders them for precision.",
        "strength": "medium",
        "target_id": "task_rank",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "retrieve",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "No way to refine search"
      ],
      "risk": "Irrelevant results",
      "tip": "Allow filtering and show relevance scores"
    }
  },
  {
    "capabilities": [
      {
        "example": "Photo editor selecting just the sky pixels to change color independently",
        "name": "Image Segmentation",
        "tag": "image-segmentation"
      },
      {
        "example": "Video editor generating precise person outline for green screen replacement",
        "name": "Mask Generation",
        "tag": "mask-generation"
      },
      {
        "example": "Self-driving car identifying road, sidewalk, vehicle, and pedestrian regions",
        "name": "Semantic Segmentation",
        "tag": "semantic-segmentation"
      },
      {
        "example": "Outlining the damaged area in uploaded car accident photo for insurance claim",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Cut out and separate specific chunks of image or other data.",
    "example_usage": "Removing background from an image.",
    "id": "task_segment",
    "implementation_notes": {
      "data_requirements": "large",
      "human_oversight": "optional",
      "maturity": "established",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_point_cloud",
            "label": "3D Cloud"
          }
        ],
        "required": [
          {
            "id": "data_image",
            "label": "Source Image"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_json",
            "label": "Polygons"
          }
        ],
        "primary": {
          "id": "data_mask",
          "isArray": true,
          "label": "Masks"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Segment",
    "relations": [
      {
        "reason": "Segmentation masks allow targeted transformation (inpainting) of specific image regions.",
        "strength": "medium",
        "target_id": "task_transform",
        "type": "enables"
      },
      {
        "reason": "Detection provides regions of interest for detailed segmentation.",
        "strength": "medium",
        "target_id": "task_detect",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Segmented regions are often classified individually (e.g., multi-object scene understanding).",
        "strength": "medium",
        "target_id": "task_classify",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "segment",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "No manual correction tools"
      ],
      "risk": "Artifacts at edges",
      "tip": "Allow brush refinement for precision"
    }
  },
  {
    "capabilities": [
      {
        "example": "Tagging support tickets as 'Billing', 'Technical', or 'General'",
        "name": "Text Classification",
        "tag": "text-classification"
      },
      {
        "example": "Identifying 'Hot Dog' vs 'Not Hot Dog' in user photos",
        "name": "Image Classification",
        "tag": "image-classification"
      },
      {
        "example": "Categorizing sound clips as 'Speech', 'Music', or 'Noise'",
        "name": "Audio Classification",
        "tag": "audio-classification"
      },
      {
        "example": "Labeling video clips with 'Sports', 'News', 'Comedy'",
        "name": "Video Classification",
        "tag": "video-classification"
      },
      {
        "example": "Classifying tweets into arbitrary categories defined at runtime",
        "name": "Zero-Shot Classification",
        "tag": "zero-shot-classification"
      },
      {
        "example": "Classifying multimodal inputs into defined buckets",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Categorize items into predefined groups.",
    "example_usage": "Tagging support tickets by department.",
    "id": "task_classify",
    "implementation_notes": {
      "data_requirements": "medium",
      "human_oversight": "optional",
      "maturity": "commoditized",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_list",
            "label": "Taxonomy"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "label": "Input Item"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Confidence"
          }
        ],
        "primary": {
          "id": "data_classification",
          "label": "Label"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Classify",
    "relations": [
      {
        "reason": "Classification tags are the most common input for business logic (if 'Billing', route to 'Finance').",
        "strength": "strong",
        "target_id": "system_rules",
        "type": "enables"
      },
      {
        "reason": "Do not classify generative output directly for safety; use a specialized Verify task.",
        "strength": "strong",
        "target_id": "task_generate",
        "type": "incompatible_with"
      },
      {
        "reason": "Explainability provides transparency into *why* a label was assigned.",
        "strength": "strong",
        "target_id": "task_explain",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "classify",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Single classification without confidence threshold"
      ],
      "risk": "Ambiguity in edge cases",
      "tip": "Show top-k results with confidence scores"
    }
  },
  {
    "capabilities": [
      {
        "example": "Matching user query 'refund policy' to FAQ 'How do I get my money back?'",
        "name": "Sentence Similarity",
        "tag": "sentence-similarity"
      },
      {
        "example": "Comparing visual style of two logos",
        "name": "Feature Extraction",
        "tag": "feature-extraction"
      },
      {
        "example": "Matching a resume PDF to a job description text",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Determine how similar two items are.",
    "example_usage": "Finding duplicate customer records.",
    "id": "task_match",
    "implementation_notes": {
      "data_requirements": "medium",
      "human_oversight": "none",
      "maturity": "established",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_any",
            "label": "Item A"
          },
          {
            "id": "data_any",
            "label": "Item B"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_score",
          "label": "Similarity"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Match",
    "relations": [
      {
        "reason": "Match scores usually feed into a threshold rule (if similarity > 0.9, merge).",
        "strength": "medium",
        "target_id": "system_rules",
        "type": "commonly_followed_by"
      },
      {
        "reason": "High-confidence matches should still be reviewed before merging.",
        "strength": "medium",
        "target_id": "human_review",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "match",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Auto-merging without review"
      ],
      "risk": "False matches",
      "tip": "Side-by-side comparison for user verification"
    }
  },
  {
    "capabilities": [
      {
        "example": "Ordering help articles by semantic relevance to query",
        "name": "Sentence Similarity",
        "tag": "sentence-similarity"
      },
      {
        "example": "Re-ranking search results for higher precision",
        "name": "Cross-Encoder Reranking",
        "tag": "text-classification"
      },
      {
        "example": "Sorting product reviews by helpfulness",
        "name": "Text Ranking",
        "tag": "text-ranking"
      },
      {
        "example": "Ranking candidate profiles against a job opening",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Sort items by relevance, quality, or importance.",
    "example_usage": "Search result ordering.",
    "id": "task_rank",
    "implementation_notes": {
      "data_requirements": "large",
      "human_oversight": "none",
      "maturity": "established",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_text",
            "label": "Context"
          },
          {
            "id": "data_preference_profile",
            "label": "User Profile"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "isArray": true,
            "label": "Items"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "isArray": true,
            "label": "Rank Scores"
          }
        ],
        "primary": {
          "id": "data_any",
          "isArray": true,
          "label": "Sorted List"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Rank",
    "relations": [
      {
        "reason": "Retrieve fetches the candidates; Rank sorts them for the user.",
        "strength": "strong",
        "target_id": "task_retrieve",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Ranking prepares choices for human decision making.",
        "strength": "strong",
        "target_id": "human_select_option",
        "type": "enables"
      },
      {
        "reason": "User interactions can refine ranking over time.",
        "strength": "medium",
        "target_id": "task_adapt",
        "type": "updated_by"
      }
    ],
    "slug": "rank",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "No transparency in ranking logic"
      ],
      "risk": "Bias in ranking factors",
      "tip": "Explain ranking factors and allow sorting options"
    }
  },
  {
    "capabilities": [
      {
        "example": "Predicting house price based on sq ft, location, and year built",
        "name": "Tabular Regression",
        "tag": "tabular-regression"
      }
    ],
    "elevator_pitch": "Predict numerical values (price, score, rating) from structured data.",
    "example_usage": "Predicting house prices from property attributes.",
    "id": "task_regress",
    "implementation_notes": {
      "data_requirements": "medium",
      "human_oversight": "optional",
      "maturity": "established",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_table",
            "label": "Features"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Confidence Interval"
          }
        ],
        "primary": {
          "id": "data_score",
          "label": "Predicted Value"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Regress",
    "relations": [
      {
        "reason": "Regression predictions often trigger threshold-based actions.",
        "strength": "medium",
        "target_id": "system_rules",
        "type": "commonly_followed_by"
      },
      {
        "reason": "High-stakes predictions (medical, financial) require human review.",
        "strength": "medium",
        "target_id": "human_review",
        "type": "commonly_followed_by"
      },
      {
        "reason": "If the data has a time dimension, switch from Regression to Forecasting.",
        "strength": "medium",
        "target_id": "task_forecast",
        "type": "related_to"
      }
    ],
    "slug": "regress",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Using for out-of-distribution data without warnings"
      ],
      "risk": "Outliers and extrapolation errors",
      "tip": "Visualize trend line and confidence bounds"
    }
  },
  {
    "capabilities": [
      {
        "example": "Summarizing a long email thread into bullet points",
        "name": "Text Generation",
        "tag": "text-generation"
      },
      {
        "example": "Generating a brief abstract for a research paper",
        "name": "Summarization",
        "tag": "summarization"
      },
      {
        "example": "Summarizing key points from a recorded meeting video",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Get the key points from multiple sources combined into one.",
    "example_usage": "Summarizing meeting notes from multiple sources.",
    "id": "task_synthesize",
    "implementation_notes": {
      "data_requirements": "large",
      "human_oversight": "recommended",
      "maturity": "established",
      "typical_latency": "batch"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_session_history",
            "label": "History"
          }
        ],
        "required": [
          {
            "id": "data_text",
            "isArray": true,
            "label": "Source Texts"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_text",
          "label": "Summary"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Synthesize",
    "relations": [
      {
        "reason": "Synthesis usually operates on a set of retrieved documents.",
        "strength": "medium",
        "target_id": "task_retrieve",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Summaries can drift from source facts; verification ensures fidelity.",
        "strength": "strong",
        "target_id": "task_verify",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "synthesize",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "No way to trace claims back to sources",
        "Blending contradictory sources instead of surfacing conflict"
      ],
      "risk": "Missing key details or introducing bias",
      "tip": "Allow length adjustment and highlight source attribution"
    }
  },
  {
    "capabilities": [
      {
        "example": "Checking if a response contradicts the provided source text",
        "name": "Zero-Shot Classification",
        "tag": "zero-shot-classification"
      },
      {
        "example": "Verifying if the answer 'Yes' is supported by the policy document",
        "name": "Question Answering",
        "tag": "question-answering"
      },
      {
        "example": "Verifying if the generated image matches the prompt requirements",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Evaluate content/claims against evidence to determine accuracy, consistency, or compliance.",
    "example_usage": "Fact checking a generated statement against source documents.",
    "id": "task_verify",
    "implementation_notes": {
      "data_requirements": "large",
      "human_oversight": "recommended",
      "maturity": "emerging",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_knowledge_graph",
            "label": "Facts"
          }
        ],
        "required": [
          {
            "id": "data_text",
            "label": "Claim"
          },
          {
            "id": "data_text",
            "label": "Evidence"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Confidence"
          }
        ],
        "primary": {
          "id": "data_classification",
          "label": "Verdict"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Verify",
    "relations": [
      {
        "reason": "Automated verification is imperfect; human review is the final gate for high-stakes claims.",
        "strength": "strong",
        "target_id": "human_review",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "verify",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Verifying creative writing",
        "Using for sentiment analysis",
        "Verifying between contested sources with no ground truth"
      ],
      "risk": "False confidence in incorrect verdicts",
      "tip": "Cite evidence sources directly"
    }
  },
  {
    "capabilities": [
      {
        "example": "Simulating action sequences in a control environment to estimate expected reward before acting.",
        "name": "Reinforcement Learning",
        "tag": "reinforcement-learning"
      },
      {
        "example": "Previewing a robot motion plan in a simulated environment to catch collisions and failure states before execution.",
        "name": "Robotics",
        "tag": "robotics"
      },
      {
        "example": "Simulating multiple demand or load scenarios under different parameter assumptions (best/base/worst case).",
        "name": "Time Series Forecasting",
        "tag": "time-series-forecasting"
      },
      {
        "example": "Simulating how changes propagate through a network (e.g., supply chain disruptions spreading across dependencies).",
        "name": "Graph Machine Learning",
        "tag": "graph-machine-learning"
      },
      {
        "example": "Running counterfactual rollouts over mixed inputs (text + state + rules) to compare scenario outcomes.",
        "name": "Any-to-Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Roll forward a world state under hypothetical conditions to predict outcomes and compare scenarios.",
    "example_usage": "Running 'what-if' scenarios to preview system behavior before committing to a plan or action.",
    "id": "task_simulate",
    "implementation_notes": {
      "data_requirements": "large",
      "human_oversight": "recommended",
      "maturity": "emerging",
      "typical_latency": "batch"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_policy",
            "label": "Policy / Strategy"
          },
          {
            "id": "data_action",
            "label": "Proposed Action(s)"
          },
          {
            "id": "data_config",
            "label": "Simulation Parameters"
          },
          {
            "id": "data_knowledge_graph",
            "label": "World Rules / Graph Context"
          },
          {
            "id": "data_sensor_stream",
            "label": "Calibration / Dynamics Data"
          }
        ],
        "required": [
          {
            "id": "data_state_vector",
            "label": "Initial World State"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Outcome Scores / Risk"
          },
          {
            "id": "data_log",
            "label": "Run Trace"
          }
        ],
        "primary": {
          "id": "data_trajectory",
          "label": "Simulated Rollout"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Simulate",
    "relations": [
      {
        "reason": "Forecast predicts future values from historical series; Simulate rolls forward world state under hypothetical interventions and policies.",
        "strength": "strong",
        "target_id": "task_forecast",
        "type": "related_to"
      },
      {
        "reason": "Planning often uses simulation to evaluate candidate action sequences ('lookahead') before choosing a plan.",
        "strength": "strong",
        "target_id": "task_plan",
        "type": "enables"
      },
      {
        "reason": "Simulation results may inform actions, but should be gated by verification and human oversight in high-stakes systems.",
        "strength": "medium",
        "target_id": "task_act",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Rollouts should be sanity-checked against constraints, historical actuals, and safety rules to reduce harmful over-trust.",
        "strength": "strong",
        "target_id": "task_verify",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Accurate rollouts depend on good initial state and parameters (often derived from estimation and sensor interpretation).",
        "strength": "medium",
        "target_id": "task_estimate",
        "type": "requires_input_from"
      }
    ],
    "slug": "simulate",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Presenting simulated futures as certainty",
        "Hiding assumptions (policy, constraints, environment model) from users",
        "Auto-executing actions directly from simulation without verification and oversight"
      ],
      "risk": "False confidence from plausible-but-wrong rollouts (model mismatch, unmodeled variables, distribution shift).",
      "tip": "Label outputs as hypothetical, show assumptions/config used, and compare multiple scenarios rather than presenting a single future as truth."
    }
  },
  {
    "capabilities": [
      {
        "example": "Converting product descriptions into vectors for search",
        "name": "Feature Extraction",
        "tag": "feature-extraction"
      },
      {
        "example": "Generating embeddings for visual search",
        "name": "Image Feature Extraction",
        "tag": "image-feature-extraction"
      },
      {
        "example": "Creating semantic vectors for paragraphs",
        "name": "Sentence Transformers",
        "tag": "sentence-similarity"
      },
      {
        "example": "Predicting missing words in a sentence",
        "name": "Fill-Mask",
        "tag": "fill-mask"
      },
      {
        "example": "Representing mixed media as a single vector",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Converts content into searchable format for semantic operations (usually automatic).",
    "example_usage": "Creating embeddings for similarity search.",
    "id": "task_represent",
    "implementation_notes": {
      "data_requirements": "medium",
      "human_oversight": "none",
      "maturity": "established",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_any",
            "label": "Raw Data"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_embedding",
          "label": "Vector"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Represent",
    "relations": [
      {
        "reason": "Embeddings are the foundation of semantic retrieval.",
        "strength": "strong",
        "target_id": "task_retrieve",
        "type": "enables"
      },
      {
        "reason": "Vector similarity enables efficient matching.",
        "strength": "medium",
        "target_id": "task_match",
        "type": "enables"
      },
      {
        "reason": "Embeddings define the semantic space where clustering occurs.",
        "strength": "strong",
        "target_id": "task_cluster",
        "type": "enables"
      }
    ],
    "slug": "represent",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Mixing different embedding models",
        "Not normalizing vectors"
      ],
      "risk": "Loss of semantic meaning in projection",
      "tip": "Visualize with dimensionality reduction (t-SNE/UMAP)"
    }
  },
  {
    "capabilities": [
      {
        "example": "Grouping similar news articles",
        "name": "Feature Extraction",
        "tag": "feature-extraction"
      },
      {
        "example": "Clustering customer feedback into topics",
        "name": "Sentence Similarity",
        "tag": "sentence-similarity"
      }
    ],
    "elevator_pitch": "Find common patterns and group similar items automatically.",
    "example_usage": "Discovering common themes in thousands of support tickets.",
    "id": "task_cluster",
    "implementation_notes": {
      "data_requirements": "large",
      "human_oversight": "recommended",
      "maturity": "established",
      "typical_latency": "batch"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_config",
            "label": "Clustering Parameters"
          }
        ],
        "required": [
          {
            "id": "data_embedding",
            "isArray": true,
            "label": "Item Embeddings"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Silhouette Score"
          },
          {
            "id": "data_point",
            "isArray": true,
            "label": "Outliers"
          }
        ],
        "primary": {
          "id": "data_group",
          "isArray": true,
          "label": "Clusters"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Cluster",
    "relations": [
      {
        "reason": "Clustering operates on the vector space created by the Represent task.",
        "strength": "strong",
        "target_id": "task_represent",
        "type": "requires_input_from"
      },
      {
        "reason": "Raw clusters are just ID numbers; Synthesis is needed to read the content and generate a descriptive label.",
        "strength": "strong",
        "target_id": "task_synthesize",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Clustering provides the 'first draft' of organization for humans to refine.",
        "strength": "strong",
        "target_id": "human_organize",
        "type": "enables"
      }
    ],
    "slug": "cluster",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Forcing everything into a cluster (hiding outliers)",
        "Changing cluster definitions drastically between sessions"
      ],
      "risk": "Incoherent groupings or 'noise' items",
      "tip": "Use Generative AI (Synthesize) to auto-label the resulting clusters"
    }
  },
  {
    "capabilities": [
      {
        "example": "Writing a blog post from a title",
        "name": "Text Generation",
        "tag": "text-generation"
      },
      {
        "example": "Generating a logo from a description",
        "name": "Text-to-Image",
        "tag": "text-to-image"
      },
      {
        "example": "Creating a short animation from a script",
        "name": "Text-to-Video",
        "tag": "text-to-video"
      },
      {
        "example": "Generating sound effects from text",
        "name": "Text-to-Audio",
        "tag": "text-to-audio"
      },
      {
        "example": "Generating random faces for avatars",
        "name": "Unconditional Image Generation",
        "tag": "unconditional-image-generation"
      },
      {
        "example": "Creating a 3D asset from a prompt",
        "name": "Text-to-3D",
        "tag": "text-to-3d"
      },
      {
        "example": "Converting a 2D logo to 3D",
        "name": "Image-to-3D",
        "tag": "image-to-3d"
      },
      {
        "example": "Animating a still image",
        "name": "Image-to-Video",
        "tag": "image-to-video"
      },
      {
        "example": "Generating code from a screenshot",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Create new content from scratch based on input.",
    "example_usage": "Drafting an email reply from bullet points.",
    "id": "task_generate",
    "implementation_notes": {
      "data_requirements": "large",
      "human_oversight": "recommended",
      "maturity": "established",
      "typical_latency": "interactive"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_image",
            "label": "Image Context"
          },
          {
            "id": "data_session_history",
            "label": "Chat History"
          }
        ],
        "required": [
          {
            "id": "data_text",
            "label": "Prompt"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_any",
          "label": "Generated Content"
        }
      }
    },
    "layer_id": "layer_outbound",
    "name": "Generate",
    "relations": [
      {
        "reason": "RAG pattern: grounding generation in retrieved facts reduces hallucination.",
        "strength": "strong",
        "target_id": "task_retrieve",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Generated content should be verified against sources when accuracy matters.",
        "strength": "strong",
        "target_id": "task_verify",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Generative outputs are often starting points for human refinement.",
        "strength": "strong",
        "target_id": "human_edit",
        "type": "enables"
      }
    ],
    "slug": "generate",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Generating facts without grounding",
        "Unbounded length without user control"
      ],
      "risk": "Hallucination and fabricated facts",
      "tip": "Stream response and offer variations"
    }
  },
  {
    "capabilities": [
      {
        "example": "Turning a sketch into a photorealistic image",
        "name": "Image-to-Image",
        "tag": "image-to-image"
      },
      {
        "example": "Changing a speaker's voice to sound like someone else",
        "name": "Voice Conversion",
        "tag": "audio-to-audio"
      },
      {
        "example": "Rewriting formal text to be casual",
        "name": "Text Style Transfer",
        "tag": "text2text-generation"
      },
      {
        "example": "Applying a style filter to a video",
        "name": "Video-to-Video",
        "tag": "video-to-video"
      },
      {
        "example": "Modifying an image based on instructions",
        "name": "Image-Text-to-Image",
        "tag": "image-text-to-image"
      },
      {
        "example": "Refactoring code to a different language",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Modify style or format of existing content.",
    "example_usage": "Style transfer on an image or paraphrasing text.",
    "id": "task_transform",
    "implementation_notes": {
      "data_requirements": "medium",
      "human_oversight": "optional",
      "maturity": "emerging",
      "typical_latency": "interactive"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_text",
            "label": "Style Prompt"
          },
          {
            "id": "data_mask",
            "label": "Region Mask"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "label": "Source"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_any",
          "label": "Transformed Content"
        }
      }
    },
    "layer_id": "layer_outbound",
    "name": "Transform",
    "relations": [
      {
        "reason": "Targeted transforms (inpainting) require segmentation masks first.",
        "strength": "medium",
        "target_id": "task_segment",
        "type": "commonly_preceded_by"
      }
    ],
    "slug": "transform",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "No undo or revert option"
      ],
      "risk": "Loss of fidelity or unintended changes",
      "tip": "Show original vs transformed side-by-side"
    }
  },
  {
    "capabilities": [
      {
        "example": "Translating a website from English to French",
        "name": "Translation",
        "tag": "translation"
      },
      {
        "example": "Transcribing a voicemail to text",
        "name": "Automatic Speech Recognition",
        "tag": "automatic-speech-recognition"
      },
      {
        "example": "Reading a news article aloud",
        "name": "Text-to-Speech",
        "tag": "text-to-speech"
      },
      {
        "example": "Extracting text from a scanned document (OCR)",
        "name": "Image-to-Text",
        "tag": "image-to-text"
      },
      {
        "example": "Translating spoken Spanish to English text",
        "name": "Audio-Text-to-Text",
        "tag": "audio-text-to-text"
      },
      {
        "example": "Describing a chart in text",
        "name": "Image-Text-to-Text",
        "tag": "image-text-to-text"
      },
      {
        "example": "Generating subtitles for a video",
        "name": "Video-Text-to-Text",
        "tag": "video-text-to-text"
      },
      {
        "example": "Animating a diagram based on text explanation",
        "name": "Image-Text-to-Video",
        "tag": "image-text-to-video"
      },
      {
        "example": "Translating sign language video to text",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Convert content from one language or format to another.",
    "example_usage": "Transcribing speech to text, or translating English to Spanish.",
    "id": "task_translate",
    "implementation_notes": {
      "data_requirements": "large",
      "human_oversight": "optional",
      "maturity": "established",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_text",
            "label": "Target Language"
          },
          {
            "id": "data_text",
            "label": "Context Prompt"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "label": "Source"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Confidence"
          }
        ],
        "primary": {
          "id": "data_any",
          "label": "Translated"
        }
      }
    },
    "layer_id": "layer_outbound",
    "name": "Translate",
    "relations": [
      {
        "reason": "Translation often precedes generation in multilingual systems.",
        "strength": "medium",
        "target_id": "task_generate",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Translations should be verified for accuracy in high-stakes contexts.",
        "strength": "medium",
        "target_id": "task_verify",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Speech-to-text output is converted to embeddings for semantic search (voice search use case).",
        "strength": "medium",
        "target_id": "task_represent",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "translate",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Using for creative writing translation without post-editing",
        "Medical/legal without human review"
      ],
      "risk": "Lost nuance or cultural context",
      "tip": "Keep original accessible for comparison"
    }
  },
  {
    "capabilities": [
      {
        "example": "Personalizing news feed based on dwell time",
        "name": "Reinforcement Learning",
        "tag": "reinforcement-learning"
      },
      {
        "example": "Adapting spam filter based on user corrections",
        "name": "Online Learning",
        "tag": "tabular-classification"
      }
    ],
    "elevator_pitch": "Updates system behavior based on implicit or explicit feedback.",
    "example_usage": "Personalizing recommendations based on click patterns.",
    "id": "task_adapt",
    "implementation_notes": {
      "data_requirements": "continuous",
      "human_oversight": "optional",
      "maturity": "established",
      "typical_latency": "batch"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_preference_profile",
            "label": "User Profile"
          }
        ],
        "required": [
          {
            "id": "data_log",
            "label": "Interaction Logs"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_config",
          "label": "Updated Model State"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Adapt",
    "relations": [
      {
        "reason": "Adaptation relies on signals from human interactions (clicks, ratings, edits).",
        "strength": "strong",
        "target_id": "human_provide_feedback",
        "type": "requires_input_from"
      },
      {
        "reason": "Adaptation refines ranking/recommendation models over time.",
        "strength": "strong",
        "target_id": "task_rank",
        "type": "updates"
      },
      {
        "reason": "User behavior can improve retrieval relevance.",
        "strength": "medium",
        "target_id": "task_retrieve",
        "type": "updates"
      }
    ],
    "slug": "adapt",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Over-indexing on recent clicks",
        "No transparency in what's being learned"
      ],
      "risk": "Feedback loops and filter bubbles",
      "tip": "Allow profile reset and show adaptation controls"
    }
  },
  {
    "capabilities": [
      {
        "example": "Optimizing server cooling based on load",
        "name": "Reinforcement Learning",
        "tag": "reinforcement-learning"
      },
      {
        "example": "Robot arm sorting recycling materials",
        "name": "Robotics Control",
        "tag": "robotics"
      },
      {
        "example": "Smart home system adjusting lights based on occupancy",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Performs physical or digital actions in an environment.",
    "example_usage": "Robot arm picking up an object, or API calling an external service.",
    "id": "task_act",
    "implementation_notes": {
      "data_requirements": "continuous",
      "human_oversight": "required",
      "maturity": "emerging",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_policy",
            "label": "Policy/Strategy"
          }
        ],
        "required": [
          {
            "id": "data_state_vector",
            "label": "Environment State"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Q-value/Expected Reward"
          }
        ],
        "primary": {
          "id": "data_action",
          "label": "Action Command"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Act",
    "relations": [
      {
        "reason": "Planning determines action sequences before execution.",
        "strength": "strong",
        "target_id": "task_plan",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Action outcomes provide feedback signals for learning.",
        "strength": "medium",
        "target_id": "task_adapt",
        "type": "enables"
      },
      {
        "reason": "Users must be able to halt actions in progress.",
        "strength": "strong",
        "target_id": "human_stop_process",
        "type": "enabled_by"
      }
    ],
    "slug": "act",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "No human supervision for high-risk actions",
        "No rollback mechanism"
      ],
      "risk": "Physical damage or unintended consequences",
      "tip": "Implement emergency stop and simulation mode"
    }
  },
  {
    "capabilities": [
      {
        "example": "Occasionally showing random products to learn user tastes",
        "name": "Epsilon-Greedy",
        "tag": "reinforcement-learning"
      },
      {
        "example": "Allocating traffic to best performing headlines",
        "name": "Thompson Sampling",
        "tag": "reinforcement-learning"
      }
    ],
    "elevator_pitch": "Tries new actions to discover optimal strategies.",
    "example_usage": "A/B testing content variants automatically to find best performer.",
    "id": "task_explore",
    "implementation_notes": {
      "data_requirements": "continuous",
      "human_oversight": "optional",
      "maturity": "emerging",
      "typical_latency": "realtime"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_policy",
            "label": "Policy"
          }
        ],
        "required": [
          {
            "id": "data_state_vector",
            "label": "State"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_action",
          "label": "Trial Action"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Explore",
    "relations": [
      {
        "reason": "Exploration generates diverse data for adaptation.",
        "strength": "strong",
        "target_id": "task_adapt",
        "type": "enables"
      },
      {
        "reason": "Exploration strategies select actions to try.",
        "strength": "medium",
        "target_id": "task_act",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "explore",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Unlimited exploration in production",
        "No guardrails on tried actions"
      ],
      "risk": "Suboptimal user experience during exploration",
      "tip": "Limit exploration scope and duration"
    }
  },
  {
    "capabilities": [
      {
        "example": "Optimizing delivery routes in real-time",
        "name": "Policy Learning",
        "tag": "reinforcement-learning"
      },
      {
        "example": "Autonomous drone navigating around obstacles",
        "name": "Motion Planning",
        "tag": "robotics"
      },
      {
        "example": "Scheduling meeting times for a large team",
        "name": "Any to Any",
        "tag": "any-to-any"
      }
    ],
    "elevator_pitch": "Optimizes or generates a sequence of future actions to achieve a goal.",
    "example_usage": "Route optimization or task scheduling.",
    "id": "task_plan",
    "implementation_notes": {
      "data_requirements": "large",
      "human_oversight": "recommended",
      "maturity": "emerging",
      "typical_latency": "batch"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_state_vector",
            "label": "Current State"
          }
        ],
        "required": [
          {
            "id": "data_text",
            "label": "Goal"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_trajectory",
            "label": "Path"
          }
        ],
        "primary": {
          "id": "data_json",
          "isArray": true,
          "label": "Action Plan"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Plan",
    "relations": [
      {
        "reason": "Spatial estimation provides the world-model for planning.",
        "strength": "medium",
        "target_id": "task_estimate",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Plans are executed as sequences of actions.",
        "strength": "strong",
        "target_id": "task_act",
        "type": "enables"
      }
    ],
    "slug": "plan",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "No contingency for plan failure"
      ],
      "risk": "Rigidity and failure to adapt to changes",
      "tip": "Allow manual override and replanning"
    }
  },
  {
    "capabilities": [
      {
        "example": "Analyzing months of accepted blog posts to discover recurring phrase structures, vocabulary preferences, and formatting habits that define a writer's voice",
        "name": "Sentence Similarity",
        "tag": "sentence-similarity"
      },
      {
        "example": "Observing which product recommendations a shopper keeps versus removes over time to discover unstated preferences like avoiding synthetic fabrics",
        "name": "Tabular Classification",
        "tag": "tabular-classification"
      },
      {
        "example": "Mining a support team's ticket resolutions to discover that agents who include a one-line summary have 40% fewer re-opens — a pattern nobody explicitly taught",
        "name": "Feature Extraction",
        "tag": "feature-extraction"
      }
    ],
    "elevator_pitch": "Discover recurring patterns from aggregate human decisions over time.",
    "example_usage": "Identifying writing style patterns from content a user consistently accepts without editing.",
    "id": "task_harvest",
    "implementation_notes": {
      "data_requirements": "continuous",
      "human_oversight": "recommended",
      "maturity": "emerging",
      "typical_latency": "batch"
    },
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_text",
            "label": "Source Content"
          },
          {
            "id": "data_json",
            "label": "Existing Pattern Library"
          }
        ],
        "required": [
          {
            "id": "data_log",
            "label": "Behavioral Signal Log"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Pattern Confidence"
          },
          {
            "id": "data_text",
            "label": "Source Provenance"
          }
        ],
        "primary": {
          "id": "data_json",
          "isArray": true,
          "label": "Discovered Patterns"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Harvest",
    "relations": [
      {
        "reason": "Harvested patterns are the input that adaptation applies. Harvest discovers what to learn; adapt updates behavior.",
        "strength": "strong",
        "target_id": "task_adapt",
        "type": "enables"
      },
      {
        "reason": "Individual extraction events produce raw data that harvesting aggregates into patterns over time.",
        "strength": "medium",
        "target_id": "task_extract",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Human edits — what they change and what they leave unchanged — are the primary behavioral signal.",
        "strength": "strong",
        "target_id": "human_edit",
        "type": "requires_input_from"
      },
      {
        "reason": "AI-discovered patterns are prone to hallucination; verify against source material before applying.",
        "strength": "strong",
        "target_id": "task_verify",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Low-confidence patterns should be staged for human review before affecting system behavior.",
        "strength": "medium",
        "target_id": "human_review",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Cluster groups items by similarity in a vector space at a single point in time; Harvest discovers patterns from sequential human decisions over time. Cluster is spatial (which items are near each other); Harvest is temporal (what behaviors recur across decisions). Cluster needs embeddings; Harvest needs behavioral logs with provenance.",
        "strength": "strong",
        "target_id": "task_cluster",
        "type": "distinct_from"
      }
    ],
    "slug": "harvest",
    "task_type": "ai",
    "ux_notes": {
      "anti_patterns": [
        "Harvesting from insufficient sample sizes",
        "Treating AI confidence as human validation",
        "No verification that discovered patterns exist in source material",
        "Patterns without provenance trail back to source decisions",
        "Accepting pattern candidates that cannot cite concrete examples from the behavioral log"
      ],
      "risk": "Hallucinated patterns that don't exist in source data",
      "tip": "Every discovered pattern must link to specific source decisions with provenance — timestamp, actor, and original context — so patterns are grounded in evidence, not AI confabulation"
    }
  }
] as const;

export const HUMAN_TASKS: readonly HumanTask[] = [
  {
    "common_variants": [
      "password_login",
      "passkey",
      "sso_oauth",
      "magic_link",
      "biometric_unlock"
    ],
    "elevator_pitch": "User proves identity or establishes an account/session.",
    "example_usage": "Signing in with password, passkey, SSO, or biometrics.",
    "id": "human_authenticate",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_text",
            "label": "Identifier (Email/Username)"
          },
          {
            "id": "data_signal",
            "label": "Auth Factor (OTP/Biometric)"
          }
        ],
        "required": []
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_json",
            "label": "Identity Claims"
          },
          {
            "id": "data_policy",
            "label": "Permissions / Roles"
          }
        ],
        "primary": {
          "id": "data_token",
          "label": "Session/Auth Token"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Authenticate / Identify",
    "relations": [
      {
        "reason": "Identity gates access to features and data.",
        "strength": "strong",
        "target_id": "system_rules",
        "type": "enables"
      },
      {
        "reason": "Authenticated sessions enable persistent user state.",
        "strength": "medium",
        "target_id": "system_state",
        "type": "enables"
      }
    ],
    "slug": "authenticate-identify",
    "task_type": "human"
  },
  {
    "common_variants": [
      "accept_terms",
      "deny",
      "granular_permissions",
      "privacy_settings",
      "revoke_access"
    ],
    "elevator_pitch": "User explicitly permits or denies data collection/processing and feature access.",
    "example_usage": "Opting into microphone access, location tracking, or model-training consent.",
    "id": "human_grant_consent",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_config",
            "label": "Consent Options"
          }
        ],
        "required": [
          {
            "id": "data_policy",
            "label": "Consent Policy / Terms"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_policy",
            "label": "Consent Receipt"
          },
          {
            "id": "data_score",
            "label": "Timestamp"
          }
        ],
        "primary": {
          "id": "data_signal",
          "label": "Consent Decision"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Grant / Revoke Consent",
    "relations": [
      {
        "reason": "Consent is enforced via deterministic gating rules.",
        "strength": "strong",
        "target_id": "system_rules",
        "type": "enables"
      },
      {
        "reason": "Consent decisions must be recorded for auditability.",
        "strength": "strong",
        "target_id": "system_log",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "grant-revoke-consent",
    "task_type": "human"
  },
  {
    "common_variants": [
      "oauth_connect",
      "api_key",
      "device_pairing",
      "webhook_setup"
    ],
    "elevator_pitch": "User links an external account, data source, or device to the system.",
    "example_usage": "Connecting Google Drive, Slack, calendar, or a wearable sensor.",
    "id": "human_connect_integration",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_config",
            "label": "Integration Provider"
          },
          {
            "id": "data_text",
            "label": "OAuth/Auth Code"
          }
        ],
        "required": []
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_policy",
            "label": "Granted Scopes"
          },
          {
            "id": "data_log",
            "label": "Connection Status"
          }
        ],
        "primary": {
          "id": "data_token",
          "label": "Integration Token / Credential"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Connect Integration",
    "relations": [
      {
        "reason": "Integrations require authenticated API calls.",
        "strength": "strong",
        "target_id": "system_api",
        "type": "enables"
      },
      {
        "reason": "Some integrations rely on incoming events.",
        "strength": "medium",
        "target_id": "system_webhook",
        "type": "enables"
      }
    ],
    "slug": "connect-integration",
    "task_type": "human"
  },
  {
    "common_variants": [
      "drag_and_drop",
      "camera_capture",
      "paste_from_clipboard",
      "url_import"
    ],
    "elevator_pitch": "User provides digital assets to the system.",
    "example_usage": "Uploading a CSV for analysis.",
    "id": "human_upload_file",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": []
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_file",
          "label": "File Blob"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Upload File",
    "relations": [
      {
        "reason": "Uploaded files are the source for extraction workflows.",
        "strength": "strong",
        "target_id": "task_extract",
        "type": "enables"
      }
    ],
    "slug": "upload-file",
    "task_type": "human"
  },
  {
    "common_variants": [
      "voice_dictation",
      "autocomplete_assisted",
      "template_fill"
    ],
    "elevator_pitch": "User enters text data manually.",
    "example_usage": "Typing a search query or chat message.",
    "id": "human_type_input",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": []
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_text",
          "label": "Text String"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Type Input",
    "relations": [
      {
        "reason": "Text input can be represented (embeddings) for semantic operations.",
        "strength": "strong",
        "target_id": "task_represent",
        "type": "enables"
      },
      {
        "reason": "Text prompts can drive generation.",
        "strength": "strong",
        "target_id": "task_generate",
        "type": "enables"
      }
    ],
    "slug": "type-input",
    "task_type": "human"
  },
  {
    "common_variants": [
      "wake_word_activation",
      "continuous_listening",
      "push_to_talk",
      "voice_query"
    ],
    "elevator_pitch": "User speaks a verbal command or query to the system.",
    "example_usage": "Saying 'turn on the lights' or asking 'what's the weather?'",
    "id": "human_voice_command",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": []
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_text",
            "label": "Intent (Declared or Inferred)"
          }
        ],
        "primary": {
          "id": "data_speech",
          "label": "Voice Input"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Voice Command",
    "relations": [
      {
        "reason": "Voice input must be transcribed (via ASR) for most downstream tasks.",
        "strength": "strong",
        "target_id": "task_translate",
        "type": "enables"
      },
      {
        "reason": "Commands are often classified into intents.",
        "strength": "medium",
        "target_id": "task_classify",
        "type": "enables"
      },
      {
        "reason": "Some voice queries trigger generation.",
        "strength": "medium",
        "target_id": "task_generate",
        "type": "enables"
      }
    ],
    "slug": "voice-command",
    "task_type": "human"
  },
  {
    "common_variants": [
      "hand_tracking",
      "head_nod",
      "body_pose",
      "controller_motion",
      "touchless_gesture"
    ],
    "elevator_pitch": "User performs physical gestures, hand tracking, or body movements as input.",
    "example_usage": "Pinching to zoom in VR or nodding to confirm.",
    "id": "human_gesture",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": []
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_pose",
            "label": "Body Position"
          },
          {
            "id": "data_trajectory",
            "label": "Movement Path"
          }
        ],
        "primary": {
          "id": "data_signal",
          "label": "Gesture"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Gesture Input",
    "relations": [
      {
        "reason": "Gesture recognition relies on pose estimation and keypoint detection.",
        "strength": "strong",
        "target_id": "task_estimate",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Gestures are classified into meanings (swipe, pinch, etc.).",
        "strength": "strong",
        "target_id": "task_classify",
        "type": "enables"
      },
      {
        "reason": "Gestures can control physical or digital actions.",
        "strength": "medium",
        "target_id": "task_act",
        "type": "enables"
      }
    ],
    "slug": "gesture-input",
    "task_type": "human"
  },
  {
    "common_variants": [
      "walk_in_vr",
      "teleport",
      "fly_navigation",
      "physical_movement",
      "gaze_navigation"
    ],
    "elevator_pitch": "User moves through a physical or virtual 3D environment.",
    "example_usage": "Walking around in AR or moving through a VR scene.",
    "id": "human_navigate_space",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_point_cloud",
            "label": "Environment Map"
          }
        ],
        "required": []
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_pose",
            "label": "Current Position"
          }
        ],
        "primary": {
          "id": "data_trajectory",
          "label": "Movement Path"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Navigate Space",
    "relations": [
      {
        "reason": "Navigation depends on pose estimation and spatial tracking over time.",
        "strength": "strong",
        "target_id": "task_estimate",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Movement changes what objects and surfaces can be detected.",
        "strength": "medium",
        "target_id": "task_detect",
        "type": "enables"
      },
      {
        "reason": "Movement patterns can inform preference learning and personalization.",
        "strength": "weak",
        "target_id": "task_adapt",
        "type": "enables"
      }
    ],
    "slug": "navigate-space",
    "task_type": "human"
  },
  {
    "common_variants": [
      "slide_control",
      "rotate_knob",
      "drag_slider",
      "continuous_input",
      "fine_tuning"
    ],
    "elevator_pitch": "User continuously adjusts a control (slider, knob, dial) to steer system behavior.",
    "example_usage": "Adjusting volume, thermostat, brush size, or model creativity.",
    "id": "human_adjust_control",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_config",
            "label": "Current Value"
          }
        ],
        "required": []
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_trajectory",
            "label": "Adjustment Path"
          }
        ],
        "primary": {
          "id": "data_config",
          "label": "Adjusted Value"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Adjust Control",
    "relations": [
      {
        "reason": "Control adjustments can directly drive actions in systems.",
        "strength": "medium",
        "target_id": "task_act",
        "type": "enables"
      },
      {
        "reason": "Adjustment patterns can inform preference learning.",
        "strength": "medium",
        "target_id": "task_adapt",
        "type": "enables"
      },
      {
        "reason": "Adjusting is continuous; configuring is discrete setup.",
        "strength": "medium",
        "target_id": "human_configure",
        "type": "related_to"
      }
    ],
    "slug": "adjust-control",
    "task_type": "human"
  },
  {
    "common_variants": [
      "set_preferences",
      "define_thresholds",
      "customize_behavior",
      "adjust_parameters"
    ],
    "elevator_pitch": "User defines system parameters, preferences, and operational settings.",
    "example_usage": "Setting confidence thresholds, model selection, or output format preferences.",
    "id": "human_configure",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_config",
            "label": "Current Settings"
          },
          {
            "id": "data_schema",
            "label": "Config Schema"
          }
        ],
        "required": []
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_config",
          "label": "Configuration"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Configure System",
    "relations": [
      {
        "reason": "Configuration constrains how adaptation and generation behave.",
        "strength": "strong",
        "target_id": "task_adapt",
        "type": "enables"
      },
      {
        "reason": "Configuration settings (thresholds, categories) drive classification behavior.",
        "strength": "medium",
        "target_id": "task_classify",
        "type": "enables"
      }
    ],
    "slug": "configure-system",
    "task_type": "human"
  },
  {
    "common_variants": [
      "dropdown",
      "radio_button",
      "checkbox",
      "multi_select"
    ],
    "elevator_pitch": "User chooses from predefined choices without strong commitment.",
    "example_usage": "Filtering results by category or selecting an item in a list.",
    "id": "human_select_option",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_any",
            "isArray": true,
            "label": "Options"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_selection",
          "label": "Selection"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Select Option",
    "relations": [
      {
        "reason": "Ranking often prepares a shortlist for selection.",
        "strength": "medium",
        "target_id": "task_rank",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Selections can drive deterministic branching.",
        "strength": "weak",
        "target_id": "system_rules",
        "type": "enables"
      }
    ],
    "slug": "select-option",
    "task_type": "human"
  },
  {
    "common_variants": [
      "pick_winner",
      "select_best",
      "final_decision",
      "commit_choice"
    ],
    "elevator_pitch": "User picks one option as the final choice with commitment.",
    "example_usage": "Selecting the best AI-generated draft or deciding a design direction.",
    "id": "human_choose",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_text",
            "label": "Comparison Notes"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "isArray": true,
            "label": "Options"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_text",
            "label": "Selection Reason"
          }
        ],
        "primary": {
          "id": "data_any",
          "label": "Chosen Option"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Choose Winner",
    "relations": [
      {
        "reason": "Users typically compare before choosing.",
        "strength": "strong",
        "target_id": "human_compare",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Choice patterns can inform future recommendations.",
        "strength": "medium",
        "target_id": "task_adapt",
        "type": "enables"
      }
    ],
    "slug": "choose-winner",
    "task_type": "human"
  },
  {
    "common_variants": [
      "button_click",
      "voice_command",
      "gesture",
      "scheduled_trigger"
    ],
    "elevator_pitch": "User initiates a workflow.",
    "example_usage": "Clicking 'Run' or starting a multi-step assistant.",
    "id": "human_start_process",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": []
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_signal",
          "label": "Trigger"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Start Process",
    "relations": [
      {
        "reason": "User initiation often begins orchestration.",
        "strength": "medium",
        "target_id": "system_orchestrate",
        "type": "enables"
      }
    ],
    "slug": "start-process",
    "task_type": "human"
  },
  {
    "common_variants": [
      "emergency_stop",
      "pause",
      "cancel",
      "abort"
    ],
    "elevator_pitch": "User interrupts a running workflow.",
    "example_usage": "Canceling a generation or emergency-stopping a device action.",
    "id": "human_stop_process",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": []
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_signal",
          "label": "Interrupt"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Stop Process",
    "relations": [
      {
        "reason": "Critical safety mechanism for physical and high-impact actions.",
        "strength": "strong",
        "target_id": "task_act",
        "type": "enables"
      },
      {
        "reason": "Stops typically cancel orchestration/execution paths.",
        "strength": "medium",
        "target_id": "system_orchestrate",
        "type": "related_to"
      }
    ],
    "slug": "stop-process",
    "task_type": "human"
  },
  {
    "common_variants": [
      "side_by_side_view",
      "diff_comparison",
      "a_b_testing",
      "variant_review"
    ],
    "elevator_pitch": "User evaluates multiple items side-by-side to understand differences.",
    "example_usage": "Comparing multiple AI-generated designs or recommendations.",
    "id": "human_compare",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_list",
            "label": "Comparison Criteria"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "isArray": true,
            "label": "Options"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_json",
            "label": "Comparison Matrix"
          }
        ],
        "primary": {
          "id": "data_text",
          "label": "Comparison Notes"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Compare Options",
    "relations": [
      {
        "reason": "Ranking often provides an initial ordering.",
        "strength": "medium",
        "target_id": "task_rank",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Comparison informs commitment decisions.",
        "strength": "strong",
        "target_id": "human_choose",
        "type": "enables"
      }
    ],
    "slug": "compare-options",
    "task_type": "human"
  },
  {
    "common_variants": [
      "card_sorting",
      "tagging",
      "drag_and_drop_grouping",
      "folder_management",
      "taxonomy_editing"
    ],
    "elevator_pitch": "User arranges items into groups, hierarchies, or applies semantic tags.",
    "example_usage": "Dragging notes into clusters or tagging images.",
    "id": "human_organize",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_group",
            "isArray": true,
            "label": "Suggested Clusters"
          },
          {
            "id": "data_list",
            "label": "Existing Taxonomy"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "isArray": true,
            "label": "Items"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_list",
            "label": "New/Updated Taxonomy"
          }
        ],
        "primary": {
          "id": "data_classification",
          "isArray": true,
          "label": "Applied Labels"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Organize & Label",
    "relations": [
      {
        "reason": "Clustering provides a rough draft; humans refine the structure.",
        "strength": "strong",
        "target_id": "task_cluster",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Human labeling can produce training data for future automation.",
        "strength": "medium",
        "target_id": "system_train",
        "type": "enables"
      },
      {
        "reason": "Once categories exist, AI can help automate sorting.",
        "strength": "strong",
        "target_id": "task_classify",
        "type": "enables"
      }
    ],
    "slug": "organize-label",
    "task_type": "human"
  },
  {
    "common_variants": [
      "draw_bounding_boxes",
      "highlight_text",
      "add_markers",
      "spatial_markup",
      "redline"
    ],
    "elevator_pitch": "User adds visual or spatial annotations to content (draw, highlight, comment).",
    "example_usage": "Drawing boxes for detection or highlighting text for extraction review.",
    "id": "human_annotate",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_any",
            "label": "Content"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_json",
            "isArray": true,
            "label": "Annotations"
          }
        ],
        "primary": {
          "id": "data_any",
          "label": "Annotated Content"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Annotate & Mark Up",
    "relations": [
      {
        "reason": "Annotations can validate or create ground truth for detection.",
        "strength": "medium",
        "target_id": "task_detect",
        "type": "enables"
      },
      {
        "reason": "Region annotations support segmentation workflows.",
        "strength": "medium",
        "target_id": "task_segment",
        "type": "enables"
      },
      {
        "reason": "Annotations can become training or evaluation datasets.",
        "strength": "medium",
        "target_id": "system_train",
        "type": "enables"
      }
    ],
    "slug": "annotate-markup",
    "task_type": "human"
  },
  {
    "common_variants": [
      "approve",
      "reject",
      "request_changes",
      "escalate"
    ],
    "elevator_pitch": "User validates accuracy and acceptability of system output.",
    "example_usage": "Moderator checking flagged content or editor reviewing a draft.",
    "id": "human_review",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_any",
            "label": "Content"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_signal",
          "label": "Decision"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Review & Approve",
    "relations": [
      {
        "reason": "Automated verification often precedes human review.",
        "strength": "strong",
        "target_id": "task_verify",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Review decisions can become training signals.",
        "strength": "medium",
        "target_id": "task_adapt",
        "type": "enables"
      }
    ],
    "slug": "review-approve",
    "task_type": "human"
  },
  {
    "common_variants": [
      "check_completeness",
      "verify_accuracy",
      "spot_check",
      "quality_audit"
    ],
    "elevator_pitch": "User checks data quality, completeness, and correctness against requirements.",
    "example_usage": "Verifying extraction fields or confirming record accuracy.",
    "id": "human_validate",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_schema",
            "label": "Validation Rules"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "label": "Data"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_text",
            "isArray": true,
            "label": "Issues Found"
          }
        ],
        "primary": {
          "id": "data_signal",
          "label": "Valid/Invalid"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Validate Data",
    "relations": [
      {
        "reason": "Extracted data often requires validation.",
        "strength": "strong",
        "target_id": "task_extract",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Automated checks can precede human validation.",
        "strength": "medium",
        "target_id": "task_verify",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Validation findings can improve future performance.",
        "strength": "weak",
        "target_id": "task_adapt",
        "type": "enables"
      }
    ],
    "slug": "validate-data",
    "task_type": "human"
  },
  {
    "common_variants": [
      "star_rating",
      "thumbs_up_down",
      "sentiment_select"
    ],
    "elevator_pitch": "User provides explicit signal of quality, preference, or satisfaction.",
    "example_usage": "Thumbs up/down on a response or rating recommendations.",
    "id": "human_provide_feedback",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_any",
            "label": "Target"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_signal",
          "label": "Rating"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Provide Feedback",
    "relations": [
      {
        "reason": "Feedback drives adaptation and tuning.",
        "strength": "strong",
        "target_id": "task_adapt",
        "type": "triggers"
      },
      {
        "reason": "Feedback can be converted into reward signals.",
        "strength": "medium",
        "target_id": "system_reward",
        "type": "enables"
      }
    ],
    "slug": "provide-feedback",
    "task_type": "human"
  },
  {
    "common_variants": [
      "report_issue",
      "mark_inappropriate",
      "escalate_problem",
      "submit_bug"
    ],
    "elevator_pitch": "User reports problematic content, errors, or policy violations.",
    "example_usage": "Reporting unsafe output or marking an incorrect classification.",
    "id": "human_flag",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_any",
            "label": "Content"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_text",
            "label": "Reason"
          },
          {
            "id": "data_classification",
            "label": "Issue Type"
          }
        ],
        "primary": {
          "id": "data_signal",
          "label": "Flag"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Flag Content",
    "relations": [
      {
        "reason": "Flagged content requires review/escalation.",
        "strength": "strong",
        "target_id": "human_review",
        "type": "triggers"
      },
      {
        "reason": "Flags can become negative training signals.",
        "strength": "medium",
        "target_id": "task_adapt",
        "type": "enables"
      },
      {
        "reason": "Automated verification may surface flaggable items.",
        "strength": "weak",
        "target_id": "task_verify",
        "type": "commonly_preceded_by"
      }
    ],
    "slug": "flag-content",
    "task_type": "human"
  },
  {
    "common_variants": [
      "grant_spending_authority",
      "approve_autonomous_mode",
      "set_agent_permissions",
      "escalation_override",
      "revoke_delegation"
    ],
    "elevator_pitch": "User grants an AI agent bounded authority to act on their behalf—spending caps, scope limits, time windows, or approval thresholds.",
    "example_usage": "Authorizing a shopping agent to purchase items under $50 without confirmation, or letting a coding agent merge PRs that pass all checks.",
    "id": "human_delegate",
    "io_spec": {
      "constraints": {
        "optional": [
          {
            "id": "const_human_loop",
            "label": "Permanent Gate Actions"
          },
          {
            "id": "const_cost_budget",
            "label": "Spending Cap"
          }
        ]
      },
      "inputs": {
        "optional": [
          {
            "id": "data_config",
            "label": "Budget / Spending Limits"
          },
          {
            "id": "data_policy",
            "label": "Escalation Criteria"
          }
        ],
        "required": [
          {
            "id": "data_policy",
            "label": "Authority Scope (caps, allowlists, time bounds)"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_log",
            "label": "Delegation Audit Record"
          },
          {
            "id": "data_policy",
            "label": "Scope Boundaries"
          }
        ],
        "primary": {
          "id": "data_token",
          "label": "Delegation Token / Authority Grant"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Delegate Authority",
    "relations": [
      {
        "reason": "Boundaries (caps, allowlists, scope) are typically configured before authority is delegated.",
        "strength": "strong",
        "target_id": "human_configure",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Delegation grants the agent permission to execute actions without per-action approval.",
        "strength": "strong",
        "target_id": "task_act",
        "type": "enables"
      },
      {
        "reason": "Delegated actions should be monitored for drift, overspend, or scope violations.",
        "strength": "strong",
        "target_id": "task_monitor",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Revocation is the inverse of delegation—human reclaims authority from the agent.",
        "strength": "strong",
        "target_id": "human_stop_process",
        "type": "related_to"
      },
      {
        "reason": "Consent governs data; delegation governs agency. Both transfer a form of permission, but delegation transfers the right to act.",
        "strength": "medium",
        "target_id": "human_grant_consent",
        "type": "related_to"
      }
    ],
    "slug": "delegate-authority",
    "task_type": "human"
  },
  {
    "common_variants": [
      "refine",
      "rewrite",
      "tweak",
      "format"
    ],
    "elevator_pitch": "User modifies system-generated or system-provided content.",
    "example_usage": "Rewriting an AI email draft or editing generated copy.",
    "id": "human_edit",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_any",
            "label": "Draft"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_any",
          "label": "Final Content"
        }
      }
    },
    "layer_id": "layer_outbound",
    "name": "Edit Content",
    "relations": [
      {
        "reason": "Generated content is often refined by humans.",
        "strength": "strong",
        "target_id": "task_generate",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Edit patterns can inform future improvements.",
        "strength": "weak",
        "target_id": "task_adapt",
        "type": "enables"
      },
      {
        "reason": "Edits may trigger regeneration or iteration.",
        "strength": "weak",
        "target_id": "task_generate",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "edit-content",
    "task_type": "human"
  },
  {
    "common_variants": [
      "download_file",
      "export_csv",
      "export_json",
      "copy_to_clipboard",
      "share_link"
    ],
    "elevator_pitch": "User takes an artifact out of the system into another context.",
    "example_usage": "Downloading a report, exporting a dataset, or copying a prompt pack.",
    "id": "human_export",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_schema",
            "label": "Export Format/Schema"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "label": "Artifact"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_log",
            "label": "Export Event"
          }
        ],
        "primary": {
          "id": "data_file",
          "label": "Exported File / Payload"
        }
      }
    },
    "layer_id": "layer_outbound",
    "name": "Export / Download",
    "relations": [
      {
        "reason": "Exports often require format conversion.",
        "strength": "strong",
        "target_id": "system_format",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Exports should be logged for auditing and analytics.",
        "strength": "medium",
        "target_id": "system_log",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "export-download",
    "task_type": "human"
  }
] as const;

export const SYSTEM_TASKS: readonly SystemTask[] = [
  {
    "common_variants": [
      "get_by_id",
      "fetch",
      "query",
      "search",
      "list",
      "batch_read"
    ],
    "elevator_pitch": "Retrieves existing data from persistent storage.",
    "example_usage": "Fetching user profile by ID on login.",
    "id": "system_read_db",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_json",
            "label": "Query Parameters"
          }
        ],
        "required": [
          {
            "id": "data_text",
            "label": "Record ID"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_db_record",
          "label": "Record"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Read Record",
    "relations": [
      {
        "reason": "Database reads provide the corpus for retrieval systems.",
        "strength": "medium",
        "target_id": "task_retrieve",
        "type": "enables"
      },
      {
        "reason": "Often check if record exists before creating.",
        "strength": "weak",
        "target_id": "system_create_db",
        "type": "commonly_preceded_by"
      }
    ],
    "slug": "read-record",
    "task_type": "system"
  },
  {
    "common_variants": [
      "redis_vector",
      "exact_match",
      "similarity_cache"
    ],
    "elevator_pitch": "Short-circuits processing by retrieving previously generated results for similar inputs.",
    "example_usage": "Returning a cached SQL query for 'Show me sales' without calling the LLM again.",
    "id": "system_cache",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_config",
            "label": "Similarity Threshold"
          }
        ],
        "required": [
          {
            "id": "data_embedding",
            "label": "Input Vector"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Hit Score"
          }
        ],
        "primary": {
          "id": "data_any",
          "label": "Cached Output"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Semantic Cache",
    "relations": [
      {
        "reason": "Caching relies on embeddings to find 'similar' previous requests.",
        "strength": "strong",
        "target_id": "task_represent",
        "type": "requires_input_from"
      },
      {
        "reason": "Cache lookup happens before generation; if hit, generation is skipped.",
        "strength": "strong",
        "target_id": "task_generate",
        "type": "precedes"
      }
    ],
    "slug": "semantic-cache",
    "task_type": "system"
  },
  {
    "common_variants": [
      "api_callback",
      "integration_event",
      "third_party_trigger"
    ],
    "elevator_pitch": "Waits for external service triggers.",
    "example_usage": "Listening for Stripe payment success.",
    "id": "system_webhook",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_config",
            "label": "Endpoint"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_json",
          "label": "Payload"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Webhook Listener",
    "relations": [],
    "slug": "webhook",
    "task_type": "system"
  },
  {
    "common_variants": [
      "cron_job",
      "countdown",
      "recurring_schedule",
      "one_time_trigger"
    ],
    "elevator_pitch": "Triggers actions based on time schedules.",
    "example_usage": "Nightly batch job.",
    "id": "system_timer",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_config",
            "label": "Schedule"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_signal",
          "label": "Time Event"
        }
      }
    },
    "layer_id": "layer_inbound",
    "name": "Scheduled Timer",
    "relations": [],
    "slug": "timer",
    "task_type": "system"
  },
  {
    "common_variants": [
      "if_else",
      "switch",
      "filter",
      "threshold_check"
    ],
    "elevator_pitch": "Deterministic branching logic based on conditions.",
    "example_usage": "If confidence score > 0.5, then approve.",
    "id": "system_rules",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_config",
            "label": "Rules"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "label": "Input"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_signal",
          "label": "Branch Path"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Logic Gate",
    "relations": [
      {
        "reason": "Classification outputs feed business logic rules.",
        "strength": "strong",
        "target_id": "task_classify",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Regression predictions trigger threshold-based actions.",
        "strength": "medium",
        "target_id": "task_regress",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Rule-based threshold checks trigger automated retraining when model performance degrades.",
        "strength": "medium",
        "target_id": "system_train",
        "type": "triggers"
      }
    ],
    "slug": "logic-gate",
    "task_type": "system"
  },
  {
    "common_variants": [
      "json_to_xml",
      "csv_to_json",
      "schema_mapping",
      "data_normalization"
    ],
    "elevator_pitch": "Transforms data structure without changing meaning.",
    "example_usage": "Converting JSON to CSV for spreadsheet export.",
    "id": "system_format",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_schema",
            "label": "Target Schema"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "label": "Source"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_any",
          "label": "Formatted Data"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Format Conversion",
    "relations": [],
    "slug": "format-conversion",
    "task_type": "system"
  },
  {
    "common_variants": [
      "rest_api",
      "graphql",
      "rpc",
      "webhook_call"
    ],
    "elevator_pitch": "Executes an action in an external service.",
    "example_usage": "Booking a calendar slot via Google Calendar API.",
    "id": "system_api",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_json",
            "label": "Payload"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_api_response",
          "label": "Response"
        }
      }
    },
    "layer_id": "layer_outbound",
    "name": "API Call",
    "relations": [
      {
        "reason": "Generated content often drives API actions.",
        "strength": "medium",
        "target_id": "task_generate",
        "type": "commonly_preceded_by"
      }
    ],
    "slug": "api-call",
    "task_type": "system"
  },
  {
    "common_variants": [
      "insert",
      "add",
      "post",
      "batch_create"
    ],
    "elevator_pitch": "Inserts new data into persistent storage.",
    "example_usage": "Creating a new user account in the database.",
    "id": "system_create_db",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_json",
            "label": "Metadata"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "label": "Record Data"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_json",
            "label": "Created Record"
          }
        ],
        "primary": {
          "id": "data_db_record",
          "label": "New Record ID"
        }
      }
    },
    "layer_id": "layer_outbound",
    "name": "Create Record",
    "relations": [
      {
        "reason": "Extracted structured data is typically persisted as new records.",
        "strength": "strong",
        "target_id": "task_extract",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Generated content often needs to be saved as new records.",
        "strength": "medium",
        "target_id": "task_generate",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Record creation should be logged for audit trails.",
        "strength": "medium",
        "target_id": "system_log",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "create-record",
    "task_type": "system"
  },
  {
    "common_variants": [
      "modify",
      "patch",
      "put",
      "upsert",
      "batch_update"
    ],
    "elevator_pitch": "Modifies existing data in persistent storage.",
    "example_usage": "Updating user preferences or profile information.",
    "id": "system_update_db",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_json",
            "label": "Merge Strategy"
          }
        ],
        "required": [
          {
            "id": "data_text",
            "label": "Record ID"
          },
          {
            "id": "data_any",
            "label": "Updated Data"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_json",
            "label": "Updated Fields"
          }
        ],
        "primary": {
          "id": "data_db_record",
          "label": "Updated Record ID"
        }
      }
    },
    "layer_id": "layer_outbound",
    "name": "Update Record",
    "relations": [
      {
        "reason": "Typically read existing record before updating.",
        "strength": "strong",
        "target_id": "system_read_db",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Extracted data often updates existing records.",
        "strength": "medium",
        "target_id": "task_extract",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Record updates should be logged for audit trails.",
        "strength": "medium",
        "target_id": "system_log",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "update-record",
    "task_type": "system"
  },
  {
    "common_variants": [
      "remove",
      "destroy",
      "purge",
      "soft_delete",
      "batch_delete"
    ],
    "elevator_pitch": "Removes data from persistent storage.",
    "example_usage": "Deleting user account when requested or removing expired data.",
    "id": "system_delete_db",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_config",
            "label": "Deletion Options"
          }
        ],
        "required": [
          {
            "id": "data_text",
            "label": "Record ID"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_log",
            "label": "Deletion Log"
          }
        ],
        "primary": {
          "id": "data_signal",
          "label": "Deletion Confirmation"
        }
      }
    },
    "layer_id": "layer_outbound",
    "name": "Delete Record",
    "relations": [
      {
        "reason": "Often verify record exists before deleting.",
        "strength": "medium",
        "target_id": "system_read_db",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Deletions often require human confirmation for safety.",
        "strength": "strong",
        "target_id": "human_review",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Deletions must be logged for audit trails and compliance.",
        "strength": "strong",
        "target_id": "system_log",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "delete-record",
    "task_type": "system"
  },
  {
    "common_variants": [
      "email",
      "push",
      "sms",
      "in_app_alert"
    ],
    "elevator_pitch": "Sends an alert to a user channel.",
    "example_usage": "Push notification on mobile.",
    "id": "system_notification",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_text",
            "label": "Recipient"
          },
          {
            "id": "data_text",
            "label": "Message"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_log",
          "label": "Sent Status"
        }
      }
    },
    "layer_id": "layer_outbound",
    "name": "Send Notification",
    "relations": [
      {
        "reason": "Monitoring systems trigger notifications.",
        "strength": "strong",
        "target_id": "task_monitor",
        "type": "commonly_preceded_by"
      }
    ],
    "slug": "send-notification",
    "task_type": "system"
  },
  {
    "common_variants": [
      "error_log",
      "audit_log",
      "analytics_event",
      "debug_trace"
    ],
    "elevator_pitch": "Records system state for audit trails.",
    "example_usage": "Logging an error or user action.",
    "id": "system_log",
    "io_spec": {
      "inputs": {
        "optional": [],
        "required": [
          {
            "id": "data_any",
            "label": "Event Data"
          }
        ]
      },
      "outputs": {
        "metadata": [],
        "primary": {
          "id": "data_log",
          "label": "Log Entry"
        }
      }
    },
    "layer_id": "layer_outbound",
    "name": "Log Event",
    "relations": [],
    "slug": "log-event",
    "task_type": "system"
  },
  {
    "common_variants": [
      "commit",
      "push",
      "pull",
      "merge",
      "branch",
      "tag",
      "create_pr"
    ],
    "elevator_pitch": "Executes version control operations in a Git repository.",
    "example_usage": "Committing generated code changes to a feature branch.",
    "id": "system_git",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_code",
            "label": "Files"
          },
          {
            "id": "data_text",
            "label": "Message"
          }
        ],
        "required": [
          {
            "id": "data_config",
            "label": "Repository"
          },
          {
            "id": "data_text",
            "label": "Action"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_log",
            "label": "Operation Log"
          }
        ],
        "primary": {
          "id": "data_text",
          "label": "Commit/Result ID"
        }
      }
    },
    "layer_id": "layer_outbound",
    "name": "Git Action",
    "relations": [
      {
        "reason": "Generated code often needs to be committed to version control.",
        "strength": "strong",
        "target_id": "task_generate",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Both persist data, but Git is for code/text versioning vs. structured records.",
        "strength": "medium",
        "target_id": "system_create_db",
        "type": "alternative_to"
      },
      {
        "reason": "Git operations should be logged for audit trails.",
        "strength": "medium",
        "target_id": "system_log",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "git-action",
    "task_type": "system"
  },
  {
    "common_variants": [
      "fine_tune",
      "full_train",
      "transfer_learning",
      "rlhf",
      "continued_pretraining"
    ],
    "elevator_pitch": "Executes model training or fine-tuning on ML infrastructure.",
    "example_usage": "Fine-tuning GPT-4 on customer support transcripts.",
    "id": "system_train",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_policy",
            "label": "Base Model"
          },
          {
            "id": "data_config",
            "label": "Training Config"
          }
        ],
        "required": [
          {
            "id": "data_table",
            "label": "Training Data"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_log",
            "label": "Training Logs"
          },
          {
            "id": "data_json",
            "label": "Training Metrics"
          }
        ],
        "primary": {
          "id": "data_policy",
          "label": "Trained Model"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Train Model",
    "relations": [
      {
        "reason": "Training jobs should be followed by evaluation to measure effectiveness.",
        "strength": "strong",
        "target_id": "system_evaluate",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Trained models must be persisted to storage as new records.",
        "strength": "strong",
        "target_id": "system_create_db",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Training data often needs format conversion before training.",
        "strength": "medium",
        "target_id": "system_format",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "RLHF training requires human preference data.",
        "strength": "medium",
        "target_id": "human_provide_feedback",
        "type": "commonly_preceded_by"
      }
    ],
    "slug": "train-model",
    "task_type": "system"
  },
  {
    "common_variants": [
      "performance_test",
      "benchmark",
      "ablation_study",
      "a_b_comparison",
      "regression_test"
    ],
    "elevator_pitch": "Calculates performance metrics for model quality assessment.",
    "example_usage": "Running test suite to measure accuracy and F1 score.",
    "id": "system_evaluate",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_json",
            "label": "Evaluation Config"
          },
          {
            "id": "data_policy",
            "label": "Baseline Model"
          }
        ],
        "required": [
          {
            "id": "data_policy",
            "label": "Model"
          },
          {
            "id": "data_table",
            "label": "Test Dataset"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Primary Metric"
          },
          {
            "id": "data_json",
            "label": "Per-Class Metrics"
          }
        ],
        "primary": {
          "id": "data_json",
          "label": "Metrics Report"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Evaluate Model",
    "relations": [
      {
        "reason": "Evaluation typically follows training to validate model quality.",
        "strength": "strong",
        "target_id": "system_train",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Evaluation metrics trigger deployment decisions via threshold checks.",
        "strength": "strong",
        "target_id": "system_rules",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Evaluation results should be reviewed before production deployment.",
        "strength": "medium",
        "target_id": "human_review",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Evaluation results are logged for model monitoring and audit trails.",
        "strength": "medium",
        "target_id": "system_log",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Evaluation metrics feed into threshold logic (if accuracy < 0.9, trigger retraining).",
        "strength": "strong",
        "target_id": "system_rules",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "evaluate-model",
    "task_type": "system"
  },
  {
    "common_variants": [
      "agent_coordination",
      "task_distribution",
      "parallel_execution",
      "sequential_workflow",
      "dag_execution"
    ],
    "elevator_pitch": "Coordinates task execution across multiple agents or services.",
    "example_usage": "Managing parallel execution of specialist agents in AutoGPT.",
    "id": "system_orchestrate",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_state_vector",
            "label": "Shared State"
          },
          {
            "id": "data_config",
            "label": "Orchestration Rules"
          }
        ],
        "required": [
          {
            "id": "data_json",
            "label": "Task Plan"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_log",
            "label": "Coordination Log"
          },
          {
            "id": "data_signal",
            "label": "Completion Signal"
          }
        ],
        "primary": {
          "id": "data_json",
          "label": "Execution Results"
        }
      }
    },
    "layer_id": "layer_internal",
    "name": "Orchestrate Workflow",
    "relations": [
      {
        "reason": "Planning tasks create the execution strategy that orchestration implements.",
        "strength": "strong",
        "target_id": "task_plan",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Business logic determines orchestration routing decisions.",
        "strength": "medium",
        "target_id": "system_rules",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Orchestration coordination should be logged for debugging and monitoring.",
        "strength": "strong",
        "target_id": "system_log",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Don't confuse orchestration (internal coordination) with webhooks (external events).",
        "strength": "medium",
        "target_id": "system_webhook",
        "type": "incompatible_with"
      }
    ],
    "slug": "orchestrate",
    "task_type": "system"
  },
  {
    "common_variants": [
      "click_tracking",
      "scroll_depth",
      "session_recording",
      "funnel_analytics",
      "heatmap_data"
    ],
    "elevator_pitch": "Captures behavioral data across all user interactions for adaptation and analysis.",
    "example_usage": "Tracking click patterns, dwell times, and user journey paths.",
    "id": "system_analytics",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_session_history",
            "label": "Session Context"
          },
          {
            "id": "data_preference_profile",
            "label": "User Profile"
          }
        ],
        "required": [
          {
            "id": "data_any",
            "label": "User Event"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_json",
            "label": "Event Properties"
          },
          {
            "id": "data_score",
            "label": "Timestamp"
          }
        ],
        "primary": {
          "id": "data_log",
          "label": "Analytics Event"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Analytics Collection",
    "relations": [
      {
        "reason": "Analytics provides the raw behavioral data that adaptation requires.",
        "strength": "strong",
        "target_id": "task_adapt",
        "type": "enables"
      },
      {
        "reason": "Collected analytics events are processed into reward signals.",
        "strength": "strong",
        "target_id": "system_reward",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Explicit feedback is one type of event captured by analytics.",
        "strength": "medium",
        "target_id": "human_provide_feedback",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Analytics events are often also logged for audit/debugging.",
        "strength": "medium",
        "target_id": "system_log",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "analytics-collection",
    "task_type": "system"
  },
  {
    "common_variants": [
      "ab_test",
      "multivariate_test",
      "bandit_allocation",
      "feature_flag",
      "gradual_rollout"
    ],
    "elevator_pitch": "Manages experimentation infrastructure for controlled testing of variants.",
    "example_usage": "Traffic splitting between two recommendation algorithms to measure lift.",
    "id": "system_experiment",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_preference_profile",
            "label": "Segmentation Data"
          }
        ],
        "required": [
          {
            "id": "data_config",
            "label": "Experiment Config"
          },
          {
            "id": "data_text",
            "label": "User ID"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_json",
            "label": "Experiment Context"
          },
          {
            "id": "data_score",
            "label": "Traffic Allocation %"
          }
        ],
        "primary": {
          "id": "data_selection",
          "label": "Variant Assignment"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "A/B Test Manager",
    "relations": [
      {
        "reason": "A/B testing is the infrastructure layer for systematic exploration.",
        "strength": "strong",
        "target_id": "task_explore",
        "type": "enables"
      },
      {
        "reason": "Experiment assignments are tracked via analytics to measure outcomes.",
        "strength": "strong",
        "target_id": "system_analytics",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Business logic determines experiment eligibility before assignment.",
        "strength": "medium",
        "target_id": "system_rules",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Experiments must be evaluated for statistical significance.",
        "strength": "strong",
        "target_id": "system_evaluate",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "ab-test-manager",
    "task_type": "system"
  },
  {
    "common_variants": [
      "drift_detection",
      "performance_tracking",
      "anomaly_detection",
      "data_quality_check",
      "latency_monitoring"
    ],
    "elevator_pitch": "Detects drift, performance degradation, and anomalies in production AI systems.",
    "example_usage": "Alerting when classification accuracy drops below threshold.",
    "id": "system_monitor_model",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_table",
            "label": "Ground Truth Data"
          },
          {
            "id": "data_config",
            "label": "Alert Thresholds"
          }
        ],
        "required": [
          {
            "id": "data_policy",
            "label": "Model State"
          },
          {
            "id": "data_log",
            "label": "Inference Logs"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_json",
            "label": "Metrics Report"
          },
          {
            "id": "data_score",
            "label": "Drift Score"
          }
        ],
        "primary": {
          "id": "data_signal",
          "label": "Health Status"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Model Monitor",
    "relations": [
      {
        "reason": "Drift detection triggers adaptation/retraining workflows.",
        "strength": "strong",
        "target_id": "task_adapt",
        "type": "triggers"
      },
      {
        "reason": "Critical model health issues alert on-call teams.",
        "strength": "strong",
        "target_id": "system_notification",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Detected drift may trigger model retraining.",
        "strength": "medium",
        "target_id": "system_train",
        "type": "commonly_followed_by"
      },
      {
        "reason": "Monitoring results are logged for incident analysis.",
        "strength": "strong",
        "target_id": "system_log",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "model-monitor",
    "task_type": "system"
  },
  {
    "common_variants": [
      "session_persistence",
      "user_context",
      "learned_preferences",
      "dialogue_state",
      "policy_checkpoint"
    ],
    "elevator_pitch": "Persists and retrieves adaptive system state across sessions.",
    "example_usage": "Loading a user's learned preferences or conversation context.",
    "id": "system_state",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_state_vector",
            "label": "State Data (for write)"
          },
          {
            "id": "data_config",
            "label": "TTL/Expiry Rules"
          }
        ],
        "required": [
          {
            "id": "data_text",
            "label": "State Key"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Last Updated Timestamp"
          },
          {
            "id": "data_json",
            "label": "State Metadata"
          }
        ],
        "primary": {
          "id": "data_state_vector",
          "label": "Retrieved State"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "State Manager",
    "relations": [
      {
        "reason": "Adaptation requires persisting what the system has learned.",
        "strength": "strong",
        "target_id": "task_adapt",
        "type": "enables"
      },
      {
        "reason": "Planning requires access to current system and environment state.",
        "strength": "strong",
        "target_id": "task_plan",
        "type": "enables"
      },
      {
        "reason": "Conversational generation needs dialogue history and context.",
        "strength": "medium",
        "target_id": "task_generate",
        "type": "enables"
      },
      {
        "reason": "State Manager is for ephemeral/session data, not permanent records.",
        "strength": "weak",
        "target_id": "system_read_db",
        "type": "incompatible_with"
      }
    ],
    "slug": "state-manager",
    "task_type": "system"
  },
  {
    "common_variants": [
      "implicit_feedback",
      "engagement_scoring",
      "conversion_attribution",
      "outcome_measurement",
      "preference_inference"
    ],
    "elevator_pitch": "Converts user behavior into quantitative feedback signals for learning.",
    "example_usage": "Computing reward score from click-through rate, dwell time, and conversions.",
    "id": "system_reward",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_json",
            "label": "Business Objectives"
          },
          {
            "id": "data_config",
            "label": "Reward Weights"
          }
        ],
        "required": [
          {
            "id": "data_log",
            "label": "User Interaction Log"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_json",
            "label": "Signal Breakdown"
          },
          {
            "id": "data_score",
            "label": "Confidence"
          }
        ],
        "primary": {
          "id": "data_score",
          "label": "Reward Signal"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Reward Calculator",
    "relations": [
      {
        "reason": "Reward signals are the primary training data for adaptive systems.",
        "strength": "strong",
        "target_id": "task_adapt",
        "type": "enables"
      },
      {
        "reason": "Exploration strategies require reward signals to learn which actions work.",
        "strength": "strong",
        "target_id": "task_explore",
        "type": "enables"
      },
      {
        "reason": "Analytics captures raw events; reward calculator interprets them.",
        "strength": "strong",
        "target_id": "system_analytics",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Explicit feedback is one input to reward calculation.",
        "strength": "medium",
        "target_id": "human_provide_feedback",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Accumulated reward signals trigger retraining workflows.",
        "strength": "medium",
        "target_id": "system_train",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "reward-calculator",
    "task_type": "system"
  },
  {
    "common_variants": [
      "dialogue_management",
      "turn_tracking",
      "context_window_management",
      "multi_turn_history",
      "conversation_branching"
    ],
    "elevator_pitch": "Maintains conversational and interactive context across turns.",
    "example_usage": "Tracking dialogue state in a multi-turn customer service chat.",
    "id": "system_session",
    "io_spec": {
      "inputs": {
        "optional": [
          {
            "id": "data_conversation",
            "label": "New Turn (for append)"
          },
          {
            "id": "data_config",
            "label": "Context Window Limits"
          }
        ],
        "required": [
          {
            "id": "data_text",
            "label": "Session ID"
          }
        ]
      },
      "outputs": {
        "metadata": [
          {
            "id": "data_score",
            "label": "Turn Count"
          },
          {
            "id": "data_json",
            "label": "Session Metadata"
          }
        ],
        "primary": {
          "id": "data_session_history",
          "label": "Session Context"
        }
      }
    },
    "layer_id": "layer_interactive",
    "name": "Session Manager",
    "relations": [
      {
        "reason": "Generation in conversational AI requires access to dialogue history.",
        "strength": "strong",
        "target_id": "task_generate",
        "type": "enables"
      },
      {
        "reason": "Multi-step planning requires tracking user goals across turns.",
        "strength": "medium",
        "target_id": "task_plan",
        "type": "enables"
      },
      {
        "reason": "Session context is often persisted via state management.",
        "strength": "strong",
        "target_id": "system_state",
        "type": "commonly_followed_by"
      },
      {
        "reason": "User input creates new turns that session manager appends.",
        "strength": "strong",
        "target_id": "human_type_input",
        "type": "commonly_preceded_by"
      },
      {
        "reason": "Session events are tracked for analytics and optimization.",
        "strength": "medium",
        "target_id": "system_analytics",
        "type": "commonly_followed_by"
      }
    ],
    "slug": "session-manager",
    "task_type": "system"
  }
] as const;

export const DATA_ARTIFACTS: readonly DataArtifactDefinition[] = [
  {
    "category": "text",
    "compatible_with": [
      "Classify",
      "Generate",
      "Extract",
      "Translate"
    ],
    "description": "Plain text input/output",
    "examples": [
      "User messages",
      "search queries",
      "form responses",
      ".txt files"
    ],
    "format_notes": "UTF-8 string, any length",
    "icon": "type",
    "id": "data_text",
    "name": "Text"
  },
  {
    "category": "text",
    "compatible_with": [
      "Extract",
      "Transform"
    ],
    "description": "Text with semantic annotations",
    "examples": [
      "HTML (.html)",
      "XML (.xml)",
      "Markdown (.md)"
    ],
    "format_notes": "String with tags",
    "icon": "code",
    "id": "data_markup",
    "name": "Markup"
  },
  {
    "category": "text",
    "compatible_with": [
      "Extract",
      "Transform",
      "Generate"
    ],
    "description": "Formatted text with hierarchy",
    "examples": [
      "Markdown (.md)",
      "Rich text (.rtf)",
      "LaTeX (.tex)"
    ],
    "format_notes": "Preserves formatting/structure",
    "icon": "file-text",
    "id": "data_structured_text",
    "name": "Structured Text"
  },
  {
    "category": "text",
    "compatible_with": [
      "Generate",
      "Verify",
      "Transform"
    ],
    "description": "Programming language text",
    "examples": [
      "Python (.py)",
      "JavaScript (.js)",
      "SQL (.sql)",
      "TypeScript (.ts)"
    ],
    "format_notes": "Syntax-aware processing",
    "icon": "code",
    "id": "data_code",
    "name": "Code"
  },
  {
    "category": "text",
    "compatible_with": [
      "Synthesize",
      "Classify",
      "Generate"
    ],
    "description": "Sequential dialogue",
    "examples": [
      "Chat logs",
      "support tickets",
      "conversation transcripts"
    ],
    "format_notes": "Array of {role, content} messages",
    "icon": "message-square",
    "id": "data_conversation",
    "name": "Conversation History"
  },
  {
    "category": "text",
    "compatible_with": [
      "Extract",
      "Translate"
    ],
    "description": "File-based document",
    "examples": [
      "PDF (.pdf)",
      "DOCX (.docx)",
      "ODT (.odt)"
    ],
    "format_notes": "Binary or text content",
    "icon": "file-text",
    "id": "data_document",
    "name": "Document"
  },
  {
    "category": "text",
    "compatible_with": [
      "Adapt",
      "Synthesize"
    ],
    "description": "Past user actions/state",
    "examples": [
      "User journey",
      "Context"
    ],
    "format_notes": "Chronological event log",
    "icon": "history",
    "id": "data_session_history",
    "name": "Session History"
  },
  {
    "category": "visual",
    "compatible_with": [
      "Detect",
      "Classify",
      "Segment",
      "Transform"
    ],
    "description": "Static 2D visual",
    "examples": [
      "Photos (.jpg, .png)",
      "Screenshots (.png)",
      "Diagrams (.svg, .webp)"
    ],
    "format_notes": "JPEG, PNG, WebP. Typical size 512px-4K",
    "icon": "image",
    "id": "data_image",
    "name": "Image"
  },
  {
    "category": "visual",
    "compatible_with": [
      "Detect",
      "Classify",
      "Monitor"
    ],
    "description": "Sequential frames",
    "examples": [
      "Recordings (.mp4)",
      "Animations (.webm)",
      "GIFs (.gif)"
    ],
    "format_notes": "MP4, WebM. Requires processing time/cost",
    "icon": "video",
    "id": "data_video",
    "name": "Video"
  },
  {
    "category": "visual",
    "compatible_with": [
      "Monitor",
      "Detect"
    ],
    "description": "Real-time continuous video",
    "examples": [
      "Security feed (RTSP)",
      "Webcam (WebRTC)"
    ],
    "format_notes": "RTSP/WebRTC Stream",
    "icon": "video",
    "id": "data_video_stream",
    "name": "Video Stream"
  },
  {
    "category": "visual",
    "compatible_with": [
      "Estimate",
      "Detect"
    ],
    "description": "Motion vectors between frames",
    "examples": [
      "Motion tracking",
      "Velocity fields"
    ],
    "format_notes": "2D Vector Field",
    "icon": "move",
    "id": "data_optical_flow",
    "name": "Optical Flow"
  },
  {
    "category": "visual",
    "compatible_with": [
      "Generate",
      "Transform"
    ],
    "description": "Spatial geometry",
    "examples": [
      "CAD files (.obj, .fbx)",
      "Game assets (.gltf)",
      "3D scans (.stl)"
    ],
    "format_notes": "OBJ, FBX, GLTF",
    "icon": "box",
    "id": "data_3d_model",
    "name": "3D Model"
  },
  {
    "category": "visual",
    "compatible_with": [
      "Detect",
      "Segment",
      "Estimate"
    ],
    "description": "3D spatial data points",
    "examples": [
      "LiDAR scan (.las, .laz)",
      "Photogrammetry (.ply)",
      "3D sensors (.pcd)"
    ],
    "format_notes": "XYZ coordinates + optional RGB",
    "icon": "box",
    "id": "data_point_cloud",
    "name": "Point Cloud"
  },
  {
    "category": "visual",
    "compatible_with": [
      "Estimate",
      "Segment"
    ],
    "description": "Distance at each pixel",
    "examples": [
      "AR sensing",
      "3D reconstruction"
    ],
    "format_notes": "2D array of float distance values",
    "icon": "layers",
    "id": "data_depth_map",
    "name": "Depth Map"
  },
  {
    "category": "visual",
    "compatible_with": [
      "Detect",
      "Classify"
    ],
    "description": "Probability distribution map",
    "examples": [
      "Attention map",
      "Saliency"
    ],
    "format_notes": "2D float array normalized 0-1",
    "icon": "activity",
    "id": "data_heatmap",
    "name": "Heatmap"
  },
  {
    "category": "visual",
    "compatible_with": [
      "Detect",
      "Segment"
    ],
    "description": "Rectangular region of interest",
    "examples": [
      "[x,y,w,h]",
      "YOLO output"
    ],
    "format_notes": "Normalized 0-1 or pixel coords",
    "icon": "square",
    "id": "data_bbox",
    "name": "Bounding Box"
  },
  {
    "category": "visual",
    "compatible_with": [
      "Segment",
      "Transform"
    ],
    "description": "Binary or multi-class segmentation",
    "examples": [
      "Alpha channel",
      "Region masks"
    ],
    "format_notes": "Same dimensions as source image",
    "icon": "circle-dashed",
    "id": "data_mask",
    "name": "Mask"
  },
  {
    "category": "audio",
    "compatible_with": [
      "Classify",
      "Translate",
      "Transform"
    ],
    "description": "Sound recording",
    "examples": [
      "Voice memos (.mp3)",
      "Music (.wav, .flac)",
      "Podcasts (.aac)"
    ],
    "format_notes": "MP3, WAV, AAC",
    "icon": "mic",
    "id": "data_audio",
    "name": "Audio"
  },
  {
    "category": "audio",
    "compatible_with": [
      "Monitor",
      "Translate",
      "Classify"
    ],
    "description": "Real-time continuous audio",
    "examples": [
      "Microphone input",
      "Live transcription",
      "Radio stream"
    ],
    "format_notes": "PCM Buffer",
    "icon": "mic",
    "id": "data_audio_stream",
    "name": "Audio Stream"
  },
  {
    "category": "audio",
    "compatible_with": [
      "Translate (ASR)",
      "Classify"
    ],
    "description": "Human voice (subset of audio)",
    "examples": [
      "Dictation (.m4a)",
      "Voice commands",
      "Phone calls"
    ],
    "format_notes": "Optimized for voice frequency range",
    "icon": "mic",
    "id": "data_speech",
    "name": "Speech"
  },
  {
    "category": "structured",
    "compatible_with": [
      "Extract",
      "Classify",
      "Represent"
    ],
    "description": "Key-value structured data",
    "examples": [
      "API responses (.json)",
      "Config files (.json)",
      "GeoJSON (.geojson)"
    ],
    "format_notes": "Hierarchical, typed values",
    "icon": "code",
    "id": "data_json",
    "name": "JSON"
  },
  {
    "category": "structured",
    "compatible_with": [
      "Classify",
      "Rank"
    ],
    "description": "Ordered collection of items",
    "examples": [
      "Menu items",
      "Taxonomy",
      "To-do lists"
    ],
    "format_notes": "JSON Array",
    "icon": "list",
    "id": "data_list",
    "name": "List / Array"
  },
  {
    "category": "structured",
    "compatible_with": [
      "Regress",
      "Classify"
    ],
    "description": "Rows and columns",
    "examples": [
      "Spreadsheets (.csv, .xlsx)",
      "SQL results",
      "Data exports (.tsv, .parquet)"
    ],
    "format_notes": "CSV, TSV, Parquet",
    "icon": "table",
    "id": "data_table",
    "name": "Table"
  },
  {
    "category": "structured",
    "compatible_with": [
      "Retrieve",
      "Verify"
    ],
    "description": "Entities and relationships",
    "examples": [
      "Ontology (.owl, .rdf)",
      "Semantic Web",
      "Knowledge bases (.ttl)"
    ],
    "format_notes": "Graph/Triples",
    "icon": "network",
    "id": "data_knowledge_graph",
    "name": "Knowledge Graph"
  },
  {
    "category": "structured",
    "compatible_with": [
      "Retrieve",
      "Match"
    ],
    "description": "High-dimensional vector",
    "examples": [
      "Search index",
      "Feature vector"
    ],
    "format_notes": "Float32Array, typically 384-1536 dims",
    "icon": "hash",
    "id": "data_embedding",
    "name": "Embedding"
  },
  {
    "category": "structured",
    "compatible_with": [
      "All"
    ],
    "description": "Single observation or measurement",
    "examples": [
      "Temperature reading",
      "Outlier instance",
      "Cluster center"
    ],
    "format_notes": "Scalar or vector value",
    "icon": "circle",
    "id": "data_point",
    "name": "Data Point"
  },
  {
    "category": "structured",
    "compatible_with": [
      "Act",
      "Plan",
      "Explore"
    ],
    "description": "Current system/environment state",
    "examples": [
      "Game state",
      "Robot position"
    ],
    "format_notes": "Numerical array representing condition",
    "icon": "cpu",
    "id": "data_state_vector",
    "name": "State Vector"
  },
  {
    "category": "structured",
    "compatible_with": [
      "Monitor",
      "Estimate"
    ],
    "description": "Real-time sensor readings",
    "examples": [
      "Accelerometer",
      "Temperature"
    ],
    "format_notes": "Continuous measurement series",
    "icon": "activity",
    "id": "data_sensor_stream",
    "name": "Sensor Stream"
  },
  {
    "category": "structured",
    "compatible_with": [
      "Plan",
      "Act"
    ],
    "description": "Path over time",
    "examples": [
      "Robot path",
      "Drone flight plan"
    ],
    "format_notes": "Sequence of positions with timestamps",
    "icon": "trending-up",
    "id": "data_trajectory",
    "name": "Trajectory"
  },
  {
    "category": "structured",
    "compatible_with": [
      "Estimate",
      "Act"
    ],
    "description": "Spatial position and orientation",
    "examples": [
      "[x, y, z, roll, pitch, yaw]",
      "Head position in VR",
      "Robot arm configuration"
    ],
    "format_notes": "6-DOF vector (position + rotation)",
    "icon": "move",
    "id": "data_pose",
    "name": "Pose"
  },
  {
    "category": "structured",
    "compatible_with": [
      "Rank",
      "Adapt"
    ],
    "description": "Explicit/Implicit preferences",
    "examples": [
      "Settings",
      "Learned preferences"
    ],
    "format_notes": "JSON or Vector representation",
    "icon": "user",
    "id": "data_preference_profile",
    "name": "User Profile"
  },
  {
    "category": "system",
    "compatible_with": [
      "All"
    ],
    "description": "Authentication or authorization credential",
    "examples": [
      "JWT token",
      "OAuth access token",
      "API key",
      "Session ID"
    ],
    "format_notes": "Encrypted string, time-limited",
    "icon": "key",
    "id": "data_token",
    "name": "Token / Credential"
  },
  {
    "category": "system",
    "compatible_with": [
      "All"
    ],
    "description": "Numerical value (confidence, similarity, etc)",
    "examples": [
      "0.85 confidence",
      "0.92 similarity",
      "Ranking score"
    ],
    "format_notes": "Float, typically 0-1",
    "icon": "gauge",
    "id": "data_score",
    "name": "Score"
  },
  {
    "category": "system",
    "compatible_with": [
      "Classify",
      "Verify"
    ],
    "description": "Categorical label",
    "examples": [
      "Spam/Not Spam",
      "Cat/Dog",
      "Sentiment labels"
    ],
    "format_notes": "String label from taxonomy",
    "icon": "tag",
    "id": "data_classification",
    "name": "Classification"
  },
  {
    "category": "system",
    "compatible_with": [
      "Monitor",
      "Act"
    ],
    "description": "Control flow trigger",
    "examples": [
      "Start",
      "Stop",
      "Alert",
      "Threshold breach"
    ],
    "format_notes": "Boolean or Enum",
    "icon": "zap",
    "id": "data_signal",
    "name": "Signal"
  },
  {
    "category": "system",
    "compatible_with": [
      "Adapt",
      "Harvest",
      "Delegate Authority"
    ],
    "description": "System event record",
    "examples": [
      "Error trace (.log)",
      "Audit log",
      "Access logs"
    ],
    "format_notes": "Timestamped structured data",
    "icon": "list",
    "id": "data_log",
    "name": "Log"
  },
  {
    "category": "system",
    "compatible_with": [
      "Adapt",
      "Delegate Authority"
    ],
    "description": "System parameters",
    "examples": [
      "Model settings (.json, .yaml)",
      "Thresholds (.yml)",
      "Environment vars (.env)"
    ],
    "format_notes": "JSON/YAML",
    "icon": "settings",
    "id": "data_config",
    "name": "Config"
  },
  {
    "category": "system",
    "compatible_with": [
      "Format"
    ],
    "description": "Data structure definition",
    "examples": [
      "JSON Schema (.json)",
      "SQL Schema (.sql)",
      "GraphQL Schema (.graphql)"
    ],
    "format_notes": "Formal specification",
    "icon": "file-code",
    "id": "data_schema",
    "name": "Schema"
  },
  {
    "category": "system",
    "compatible_with": [
      "Load",
      "Save"
    ],
    "description": "Persisted entity",
    "examples": [
      "User row",
      "Product item",
      "Transaction record"
    ],
    "format_notes": "ORM Object",
    "icon": "database",
    "id": "data_db_record",
    "name": "DB Record"
  },
  {
    "category": "system",
    "compatible_with": [
      "API Call"
    ],
    "description": "External service data",
    "examples": [
      "Weather data (.json)",
      "Payment status",
      "REST response"
    ],
    "format_notes": "JSON/XML",
    "icon": "globe",
    "id": "data_api_response",
    "name": "API Response"
  },
  {
    "category": "system",
    "compatible_with": [
      "Act",
      "Explore"
    ],
    "description": "Discrete or continuous action",
    "examples": [
      "Button press",
      "Motor command",
      "API call trigger"
    ],
    "format_notes": "Enum or Vector",
    "icon": "zap",
    "id": "data_action",
    "name": "Action"
  },
  {
    "category": "system",
    "compatible_with": [
      "Plan",
      "Act",
      "Delegate Authority"
    ],
    "description": "Decision-making strategy",
    "examples": [
      "Neural weights (.pt, .ckpt)",
      "Ruleset (.yaml)",
      "Decision trees"
    ],
    "format_notes": "Model/Function",
    "icon": "shield",
    "id": "data_policy",
    "name": "Policy"
  },
  {
    "category": "system",
    "compatible_with": [
      "Extract",
      "Translate"
    ],
    "description": "Binary file blob",
    "examples": [
      "Uploaded document",
      "Image file",
      "Archive (.zip, .tar.gz)"
    ],
    "format_notes": "Binary data with MIME type",
    "icon": "file",
    "id": "data_file",
    "name": "File"
  },
  {
    "category": "system",
    "compatible_with": [
      "Select"
    ],
    "description": "User choice from options",
    "examples": [
      "Dropdown value",
      "Checkbox state"
    ],
    "format_notes": "ID or value from option set",
    "icon": "check-square",
    "id": "data_selection",
    "name": "Selection"
  },
  {
    "category": "system",
    "compatible_with": [
      "Synthesize",
      "Organize"
    ],
    "description": "A collection of items grouped by similarity or logic",
    "examples": [
      "Cluster ID 1",
      "Folder: Invoices"
    ],
    "format_notes": "Object containing {id, label, items[]}",
    "icon": "grid",
    "id": "data_group",
    "name": "Group / Cluster"
  },
  {
    "category": "generic",
    "compatible_with": [
      "All"
    ],
    "description": "Flexible/unspecified data type",
    "examples": [
      "Wildcard input"
    ],
    "format_notes": "Use when type varies or is unknown",
    "icon": "asterisk",
    "id": "data_any",
    "name": "Any"
  },
  {
    "category": "generic",
    "compatible_with": [
      "Detect",
      "Classify"
    ],
    "description": "Combined data types",
    "examples": [
      "Video with audio",
      "Image with text"
    ],
    "format_notes": "Container format (MKV, MP4)",
    "icon": "layers",
    "id": "data_multimodal",
    "name": "Multimodal"
  }
] as const;

export const CONSTRAINTS: readonly ConstraintDefinition[] = [
  {
    "applies_to": [
      "Extract",
      "Generate"
    ],
    "category": "quality_safety",
    "description": "Ensures PII is handled correctly.",
    "example_values": "GDPR compliant, anonymize outputs",
    "icon": "shield-check",
    "id": "const_privacy",
    "name": "Privacy Preserving",
    "type": "Policy",
    "ux_note": "Display data handling notice."
  },
  {
    "applies_to": [
      "Generate",
      "Retrieve"
    ],
    "category": "performance_resource",
    "description": "Maximum allowed time for execution.",
    "example_values": "< 200ms for UI, < 5s for batch",
    "icon": "clock",
    "id": "const_latency",
    "name": "Latency Budget",
    "type": "Milliseconds",
    "ux_note": "Show loading indicator if exceeded"
  },
  {
    "applies_to": [
      "Classify",
      "Detect",
      "Verify"
    ],
    "category": "model_technical",
    "description": "Minimum score required to act.",
    "example_values": "0.85 for automation, 0.95 for safety-critical",
    "icon": "gauge",
    "id": "const_confidence",
    "name": "Confidence Threshold",
    "type": "Float (0-1)",
    "ux_note": "Route low-confidence to human review"
  },
  {
    "applies_to": [
      "Act",
      "Generate",
      "Harvest",
      "Delegate Authority"
    ],
    "category": "quality_safety",
    "description": "Requires human approval before action.",
    "example_values": "Always for medical/legal, optional for creative",
    "icon": "user-check",
    "id": "const_human_loop",
    "name": "Human Verification",
    "type": "Workflow",
    "ux_note": "Add review step in UI."
  },
  {
    "applies_to": [
      "API Call",
      "Generate"
    ],
    "category": "performance_resource",
    "description": "Max requests per time window.",
    "example_values": "100 req/min, 1000 req/hour",
    "icon": "bar-chart",
    "id": "const_rate_limit",
    "name": "Rate Limit",
    "type": "Integer",
    "ux_note": "Queue or throttle requests"
  },
  {
    "applies_to": [
      "Generate",
      "Synthesize"
    ],
    "category": "model_technical",
    "description": "Token limit for model input.",
    "example_values": "4k, 32k, 128k tokens",
    "icon": "layers",
    "id": "const_context_window",
    "name": "Context Window",
    "type": "Integer",
    "ux_note": "Truncate or chunk long inputs"
  },
  {
    "applies_to": [
      "Generate",
      "Transform"
    ],
    "category": "ux_interaction",
    "description": "Style of generated content.",
    "example_values": "Professional, Casual, Friendly, Technical",
    "icon": "message-circle",
    "id": "const_tone",
    "name": "Tone & Voice",
    "type": "String",
    "ux_note": "Allow user selection"
  },
  {
    "applies_to": [
      "Extract",
      "Generate"
    ],
    "category": "data_context",
    "description": "Strict structure requirement.",
    "example_values": "JSON Schema, Markdown, CSV",
    "icon": "file-check",
    "id": "const_format",
    "name": "Output Format",
    "type": "Schema",
    "ux_note": "Validate output before returning"
  },
  {
    "applies_to": [
      "API Call",
      "Load from Database",
      "Save to Database"
    ],
    "category": "quality_safety",
    "description": "User or service authentication is required for this operation.",
    "example_values": "OAuth2, JWT, API key, SSO, mTLS",
    "icon": "key",
    "id": "const_authentication",
    "name": "Authentication Required",
    "type": "Policy",
    "ux_note": "Display login prompt or return 401 if unauthenticated"
  },
  {
    "applies_to": [
      "API Call",
      "Generate",
      "Act",
      "Load from Database",
      "Delegate Authority"
    ],
    "category": "quality_safety",
    "description": "Access control based on user roles or permissions.",
    "example_values": "Admin only, Editor role, View-only for guests, RBAC policy",
    "icon": "shield-check",
    "id": "const_authorization",
    "name": "Role-Based Access",
    "type": "Policy",
    "ux_note": "Check user roles before allowing action, show permissions error if unauthorized"
  },
  {
    "applies_to": [
      "Save to Database",
      "API Call",
      "Generate"
    ],
    "category": "quality_safety",
    "description": "Data must be encrypted in transit and/or at rest.",
    "example_values": "TLS 1.3, AES-256 at rest, End-to-end encryption",
    "icon": "lock",
    "id": "const_encryption",
    "name": "Encryption Required",
    "type": "Policy",
    "ux_note": "Use TLS/HTTPS, encrypt sensitive fields before storage"
  },
  {
    "applies_to": [
      "Generate",
      "Train Model",
      "API Call",
      "Retrieve",
      "Delegate Authority"
    ],
    "category": "performance_resource",
    "description": "Maximum cost allowed per operation or time period.",
    "example_values": "$0.01 per query, $100 per day, $1000 per month",
    "icon": "dollar-sign",
    "id": "const_cost_budget",
    "name": "Cost Budget",
    "type": "Currency",
    "ux_note": "Track spending, alert when approaching limit, block if exceeded"
  },
  {
    "applies_to": [
      "Generate",
      "Train Model",
      "Evaluate Model"
    ],
    "category": "performance_resource",
    "description": "Maximum compute resources allowed (tokens, GPU hours, API calls).",
    "example_values": "10k tokens per request, 100 GPU hours per month, 1000 API calls per day",
    "icon": "cpu",
    "id": "const_compute_budget",
    "name": "Compute Budget",
    "type": "Integer",
    "ux_note": "Monitor usage, throttle when approaching limit"
  },
  {
    "applies_to": [
      "Generate",
      "Classify",
      "Synthesize"
    ],
    "category": "ux_interaction",
    "description": "Fixed instruction or role definition for AI model behavior.",
    "example_values": "You are a helpful customer service agent, Always respond in Spanish, Be concise and factual",
    "icon": "file-text",
    "id": "const_system_instruction",
    "name": "System Instruction",
    "type": "String",
    "ux_note": "Prepend to all requests, not visible to end user"
  },
  {
    "applies_to": [
      "Generate",
      "Transform",
      "Synthesize"
    ],
    "category": "data_context",
    "description": "Structured prompt format with variable placeholders.",
    "example_values": "Summarize this {document} in {style}, Translate {text} from {source_lang} to {target_lang}",
    "icon": "code",
    "id": "const_prompt_template",
    "name": "Prompt Template",
    "type": "Template String",
    "ux_note": "Inject user data into template, validate parameters"
  },
  {
    "applies_to": [
      "Generate",
      "Classify",
      "Extract"
    ],
    "category": "model_technical",
    "description": "Example input/output pairs to guide model behavior.",
    "example_values": "Q: What's 2+2? A: 4, Input: angry text, Output: negative sentiment",
    "icon": "book-open",
    "id": "const_few_shot_examples",
    "name": "Few-Shot Examples",
    "type": "Array",
    "ux_note": "Include examples in context, manage token budget"
  },
  {
    "applies_to": [
      "Save to Database",
      "API Call",
      "Train Model"
    ],
    "category": "quality_safety",
    "description": "Data must remain within specific geographic regions.",
    "example_values": "EU only, US regions, Canada data centers, Multi-region with restrictions",
    "icon": "map-pin",
    "id": "const_data_residency",
    "name": "Data Residency",
    "type": "Policy",
    "ux_note": "Route to region-specific infrastructure, block cross-border transfers"
  },
  {
    "applies_to": [
      "Save to Database",
      "Log Event"
    ],
    "category": "quality_safety",
    "description": "How long data should be stored before deletion.",
    "example_values": "7 days, 90 days, 7 years for compliance, Delete immediately after use",
    "icon": "calendar",
    "id": "const_data_retention",
    "name": "Data Retention",
    "type": "Duration",
    "ux_note": "Implement automatic deletion, provide retention policy notice"
  },
  {
    "applies_to": [
      "Generate",
      "Classify",
      "Transform"
    ],
    "category": "quality_safety",
    "description": "Filters for toxicity, hate speech, violence, or inappropriate content.",
    "example_values": "Block hate speech, Flag NSFW content, Age-restrict violent imagery, Filter profanity",
    "icon": "shield-alert",
    "id": "const_content_safety",
    "name": "Content Safety Policy",
    "type": "Policy",
    "ux_note": "Display content warnings, show filtered results, allow user reporting"
  },
  {
    "applies_to": [
      "Generate",
      "Retrieve",
      "API Call",
      "Act"
    ],
    "category": "ux_interaction",
    "description": "How the system responds when operations fail or produce errors.",
    "example_values": "Auto-retry 3x with backoff, Show friendly error + support link, Fallback to cached result, Queue for manual review",
    "icon": "alert-triangle",
    "id": "const_error_handling",
    "name": "Error Handling Strategy",
    "type": "Strategy",
    "ux_note": "Show retry button, display error message, offer alternative path, escalate to support"
  },
  {
    "applies_to": [
      "Generate",
      "Transform",
      "Synthesize"
    ],
    "category": "ux_interaction",
    "description": "Whether to stream partial results progressively or return complete output.",
    "example_values": "Stream for chat interfaces, Batch for reports, Progressive for long content",
    "icon": "activity",
    "id": "const_streaming",
    "name": "Streaming Mode",
    "type": "Boolean",
    "ux_note": "Show typing indicator, display tokens as they arrive, enable cancel mid-stream"
  },
  {
    "applies_to": [
      "Generate",
      "Act",
      "API Call",
      "Train Model",
      "Classify",
      "Harvest",
      "Delegate Authority"
    ],
    "category": "quality_safety",
    "description": "What user actions and system events to log for accountability.",
    "example_values": "Log all AI decisions, Track user prompts + outputs, Record model versions, Capture timestamps + user IDs",
    "icon": "history",
    "id": "const_audit_log",
    "name": "Audit Logging",
    "type": "Policy",
    "ux_note": "Minimal UI impact, may show 'Activity tracked' notice for transparency"
  },
  {
    "applies_to": [
      "Generate",
      "Extract",
      "Transform"
    ],
    "category": "model_technical",
    "description": "Minimum acceptable quality score for outputs before showing to users.",
    "example_values": "0.8 for production, 0.6 for drafts, 0.9 for legal/medical, Block below 0.5",
    "icon": "award",
    "id": "const_quality_threshold",
    "name": "Quality Threshold",
    "type": "Float (0-1)",
    "ux_note": "Show 'low quality' warning, offer regenerate option, route to human review"
  },
  {
    "applies_to": [
      "Generate",
      "Train Model",
      "Save to Database",
      "API Call"
    ],
    "category": "quality_safety",
    "description": "When and how to obtain user permission for data processing or AI usage.",
    "example_values": "Prompt before first use, Explicit opt-in for training data, Annual re-consent, Granular per-feature consent",
    "icon": "user-check",
    "id": "const_user_consent",
    "name": "User Consent",
    "type": "Policy",
    "ux_note": "Display consent dialog, provide opt-out option, link to privacy policy, record consent timestamp"
  },
  {
    "applies_to": [
      "Generate",
      "Transform",
      "Synthesize",
      "Classify"
    ],
    "category": "ux_interaction",
    "description": "Language, region, and cultural adaptation requirements for content.",
    "example_values": "Support 10 languages, Auto-detect locale, RTL for Arabic/Hebrew, Region-specific examples",
    "icon": "globe",
    "id": "const_localization",
    "name": "Localization Requirements",
    "type": "Locale",
    "ux_note": "Detect user language, provide language selector, adapt formatting (dates, currency)"
  },
  {
    "applies_to": [
      "Retrieve",
      "Generate",
      "API Call",
      "Load from Database"
    ],
    "category": "performance_resource",
    "description": "How long to cache results and when to invalidate cached data.",
    "example_values": "Cache 5 minutes, Invalidate on user action, Cache forever for static content, No cache for personalized",
    "icon": "database",
    "id": "const_caching",
    "name": "Caching Policy",
    "type": "Duration",
    "ux_note": "Show 'cached' indicator, provide refresh button, warn about stale data"
  },
  {
    "applies_to": [
      "Generate",
      "Retrieve",
      "Orchestrate"
    ],
    "category": "execution_behavior",
    "description": "Task runs independently in the background and returns results when complete.",
    "example_values": "Background agent, Async processing, Fire-and-forget, Blocking (wait for result)",
    "icon": "play-circle",
    "id": "const_autonomy",
    "name": "Autonomous Execution",
    "type": "Mode",
    "ux_note": "Show background task indicator, provide status updates, allow cancellation"
  },
  {
    "applies_to": [
      "Retrieve",
      "Generate",
      "API Call"
    ],
    "category": "execution_behavior",
    "description": "Multiple operations execute simultaneously for efficiency.",
    "example_values": "Parallel searches, Concurrent file reads, Batch API calls, Sequential only",
    "icon": "git-branch",
    "id": "const_parallelism",
    "name": "Parallel Execution",
    "type": "Strategy",
    "ux_note": "Show progress for parallel tasks, handle partial failures gracefully"
  },
  {
    "applies_to": [
      "Generate",
      "Retrieve",
      "API Call",
      "Act",
      "Delegate Authority"
    ],
    "category": "execution_behavior",
    "description": "Maximum time allowed before operation is cancelled.",
    "example_values": "30 seconds, 5 minutes, No timeout, User-configurable",
    "icon": "timer",
    "id": "const_timeout",
    "name": "Timeout Limit",
    "type": "Duration",
    "ux_note": "Show timeout warning, provide extend option, handle graceful cancellation"
  },
  {
    "applies_to": [
      "Generate",
      "Transform"
    ],
    "category": "code_philosophy",
    "description": "Prefer editing existing code over creating new files or adding unnecessary features.",
    "example_values": "Edit over write, Avoid over-engineering, Only change what's needed, YAGNI (You Aren't Gonna Need It)",
    "icon": "minimize",
    "id": "const_minimalism",
    "name": "Minimal Changes",
    "type": "Principle",
    "ux_note": "Surface this principle in code review, show edit vs write statistics"
  },
  {
    "applies_to": [
      "Generate",
      "Transform"
    ],
    "category": "code_philosophy",
    "description": "Follow existing codebase patterns and style conventions.",
    "example_values": "Match existing patterns, Follow style guide, Preserve indentation, Consistent naming",
    "icon": "code",
    "id": "const_code_style",
    "name": "Code Style Adherence",
    "type": "Policy",
    "ux_note": "Run linter/formatter, show style violations, auto-fix when possible"
  },
  {
    "applies_to": [
      "Generate",
      "Transform",
      "Act"
    ],
    "category": "code_philosophy",
    "description": "Ensure changes don't break existing functionality or APIs.",
    "example_values": "No breaking changes, Deprecate before removing, Version bumps for breaking changes, Migration guide required",
    "icon": "git-merge",
    "id": "const_backward_compatibility",
    "name": "Backward Compatibility",
    "type": "Policy",
    "ux_note": "Warn about breaking changes, suggest deprecation path, run compatibility tests"
  },
  {
    "applies_to": [
      "Generate",
      "Transform",
      "Synthesize"
    ],
    "category": "attribution",
    "description": "Generated content must credit sources, collaborators, or AI assistance.",
    "example_values": "Co-Authored-By: AI, Source citations, License attribution, Contributors list",
    "icon": "user-plus",
    "id": "const_attribution",
    "name": "Attribution Required",
    "type": "Policy",
    "ux_note": "Include attribution footer, add co-author tags, cite sources"
  },
  {
    "applies_to": [
      "Extract",
      "Transform",
      "Load from Database",
      "Save to Database"
    ],
    "category": "attribution",
    "description": "Track and document the origin and transformation history of data.",
    "example_values": "Source file tracking, Transformation history, Model version tags, Input/output logging",
    "icon": "git-commit",
    "id": "const_provenance",
    "name": "Data Provenance",
    "type": "Policy",
    "ux_note": "Log data lineage, show transformation chain, enable audit trail"
  },
  {
    "applies_to": [
      "Generate",
      "Synthesize",
      "Transform"
    ],
    "category": "attribution",
    "description": "Reference and link to source materials when generating content.",
    "example_values": "Academic style (APA/MLA), Markdown links, Footnotes, URL references",
    "icon": "link",
    "id": "const_citation",
    "name": "Source Citation",
    "type": "Format",
    "ux_note": "Include bibliography, add inline citations, link to sources"
  },
  {
    "applies_to": [
      "Generate",
      "Synthesize",
      "Transform",
      "Retrieve",
      "Verify",
      "Plan",
      "Act",
      "API Call",
      "Orchestrate"
    ],
    "category": "model_technical",
    "description": "System architecture supports swapping model providers/versions without rewriting product logic via adapters, schemas, and test gates.",
    "example_values": "Provider-agnostic message format, Tool schema normalization, Output schema enforcement, Fallback to alternative model, OpenAI/Anthropic/local adapter pattern",
    "icon": "shuffle",
    "id": "const_model_portability",
    "name": "Model Portability",
    "type": "Architecture",
    "ux_note": "Test provider swaps, validate adapter interfaces, log provider metadata, ensure fallback models available"
  },
  {
    "applies_to": [
      "Generate",
      "Verify",
      "Act",
      "Retrieve",
      "Plan",
      "Orchestrate"
    ],
    "category": "quality_safety",
    "description": "Defines which scenarios, edge cases, and safety checks must be covered by tests before deploying changes to an AI system.",
    "example_values": "Top user intents, Tool failure + timeout paths, Prompt injection tests, PII handling validation, Low-confidence fallbacks, Cost/latency ceilings, Localization checks, Regression test suite",
    "icon": "check-circle",
    "id": "const_eval_coverage",
    "name": "Evaluation Coverage",
    "type": "Testing Policy",
    "ux_note": "Show coverage reports, block deployment if gaps exist, document edge cases tested"
  }
] as const;

export const TOUCHPOINTS: readonly TouchpointDefinition[] = [
  {
    "category": "screen_interface",
    "description": "Native iOS/Android application.",
    "examples": [
      "Consumer apps",
      "Field tools"
    ],
    "icon": "smartphone",
    "id": "tp_mobile",
    "name": "Mobile App"
  },
  {
    "category": "screen_interface",
    "description": "Desktop or responsive web interface.",
    "examples": [
      "SaaS portal",
      "Admin panel"
    ],
    "icon": "layout",
    "id": "tp_web",
    "name": "Web Dashboard"
  },
  {
    "category": "screen_interface",
    "description": "Embeddable component in 3rd party sites or apps.",
    "examples": [
      "Chatbot widget",
      "Form assistant",
      "Intercom popup"
    ],
    "icon": "square-code",
    "id": "tp_embedded",
    "name": "Embedded Widget"
  },
  {
    "category": "screen_interface",
    "description": "Public facing shared device.",
    "examples": [
      "Airport check-in",
      "Retail point of sale"
    ],
    "icon": "monitor",
    "id": "tp_kiosk",
    "name": "Physical Kiosk"
  },
  {
    "category": "screen_interface",
    "description": "Small screen personal device.",
    "examples": [
      "Apple Watch",
      "Fitbit",
      "Garmin"
    ],
    "icon": "watch",
    "id": "tp_wearable",
    "name": "Smartwatch"
  },
  {
    "category": "conversational",
    "description": "Conversational UI in messaging apps.",
    "examples": [
      "Slack",
      "Teams",
      "WhatsApp",
      "Discord"
    ],
    "icon": "message-circle",
    "id": "tp_chat",
    "name": "Chat Interface"
  },
  {
    "category": "conversational",
    "description": "Plain text messaging via cellular network.",
    "examples": [
      "SMS chatbot",
      "2FA codes",
      "Text alerts"
    ],
    "icon": "message-square",
    "id": "tp_sms",
    "name": "SMS / Text"
  },
  {
    "category": "conversational",
    "description": "Asynchronous communication channel.",
    "examples": [
      "Reports",
      "Alerts",
      "Newsletters"
    ],
    "icon": "mail",
    "id": "tp_email",
    "name": "Email"
  },
  {
    "category": "conversational",
    "description": "Embodied representation with personality - 2D avatar or 3D character for anthropomorphic interaction.",
    "examples": [
      "Chatbot avatar",
      "Virtual assistant persona",
      "Game NPC",
      "VR avatar",
      "Metaverse character",
      "Training simulator instructor",
      "Brand mascot"
    ],
    "icon": "user-circle",
    "id": "tp_avatar",
    "name": "Avatar/Character"
  },
  {
    "category": "voice_audio",
    "description": "Audio-only or multimodal voice interaction.",
    "examples": [
      "Smart Speaker",
      "Phone Line",
      "Alexa"
    ],
    "icon": "mic",
    "id": "tp_voice",
    "name": "Voice Interface"
  },
  {
    "category": "voice_audio",
    "description": "3D positioned audio interface without visual component.",
    "examples": [
      "Spatial AirPods",
      "3D audio guides",
      "Directional voice"
    ],
    "icon": "audio-lines",
    "id": "tp_spatial_audio",
    "name": "Spatial Audio"
  },
  {
    "category": "voice_audio",
    "description": "Audio input device for capturing sound, speech, or ambient audio.",
    "examples": [
      "Laptop mic",
      "Smartphone mic",
      "USB microphone",
      "Lapel mic",
      "Array microphone"
    ],
    "icon": "mic-2",
    "id": "tp_microphone",
    "name": "Microphone"
  },
  {
    "category": "voice_audio",
    "description": "Personal audio device worn on or in ears, often with gesture controls.",
    "examples": [
      "In-ear headphones",
      "Over-ear headphones",
      "Hearing aids",
      "Bone conduction",
      "In-ear monitors"
    ],
    "icon": "headphones",
    "id": "tp_headphones",
    "name": "Headphones/Earbuds"
  },
  {
    "category": "voice_audio",
    "description": "Audio output device for sound in a shared or ambient space.",
    "examples": [
      "Smart speaker",
      "Soundbar",
      "PA system",
      "Car speakers",
      "Desktop speakers"
    ],
    "icon": "volume-2",
    "id": "tp_speaker",
    "name": "Speaker"
  },
  {
    "category": "spatial_computing",
    "description": "Fully immersive virtual reality experience with hand/controller input.",
    "examples": [
      "Meta Quest",
      "PSVR",
      "Training simulator"
    ],
    "icon": "headphones",
    "id": "tp_vr",
    "name": "VR Headset"
  },
  {
    "category": "spatial_computing",
    "description": "Digital content overlaid on passthrough video of physical world.",
    "examples": [
      "Apple Vision Pro",
      "Meta Quest 3",
      "Spatial apps"
    ],
    "icon": "scan",
    "id": "tp_ar_passthrough",
    "name": "Mixed Reality"
  },
  {
    "category": "spatial_computing",
    "description": "See-through optical display overlaying lightweight digital content.",
    "examples": [
      "Future Apple Glasses",
      "Snap Spectacles",
      "Smart glasses"
    ],
    "icon": "glasses",
    "id": "tp_ar_optical",
    "name": "AR Glasses"
  },
  {
    "category": "spatial_computing",
    "description": "Augmented reality through smartphone or tablet camera.",
    "examples": [
      "IKEA Place",
      "Google Lens",
      "Pokémon GO"
    ],
    "icon": "scan-line",
    "id": "tp_mobile_ar",
    "name": "Mobile AR"
  },
  {
    "category": "technical",
    "description": "Programmatic interface for 3rd party devs.",
    "examples": [
      "REST Endpoint",
      "GraphQL",
      "SDK"
    ],
    "icon": "globe",
    "id": "tp_api",
    "name": "Public API"
  },
  {
    "category": "technical",
    "description": "Command line interface for technical users.",
    "examples": [
      "Dev tools",
      "Server admin",
      "Scripts"
    ],
    "icon": "terminal",
    "id": "tp_cli",
    "name": "CLI / Terminal"
  },
  {
    "category": "technical",
    "description": "Static file output.",
    "examples": [
      "PDF Report",
      "Excel Sheet",
      "CSV Export"
    ],
    "icon": "file-text",
    "id": "tp_doc",
    "name": "Document / Report"
  },
  {
    "category": "physical_devices",
    "description": "Connected sensor or actuator with physical effects.",
    "examples": [
      "Smart thermostat",
      "Smart lock",
      "Connected lights"
    ],
    "icon": "radio",
    "id": "tp_iot_sensor",
    "name": "IoT Sensor/Actuator"
  },
  {
    "category": "physical_devices",
    "description": "Autonomous or semi-autonomous physical system.",
    "examples": [
      "Warehouse robot",
      "Delivery drone",
      "Assembly robot"
    ],
    "icon": "bot",
    "id": "tp_robot",
    "name": "Robot"
  },
  {
    "category": "physical_devices",
    "description": "Connected home or industrial appliance.",
    "examples": [
      "Smart oven",
      "HVAC system",
      "Manufacturing equipment"
    ],
    "icon": "plug",
    "id": "tp_appliance",
    "name": "Smart Appliance"
  },
  {
    "category": "physical_devices",
    "description": "In-vehicle system or autonomous vehicle.",
    "examples": [
      "Tesla Autopilot",
      "Car infotainment",
      "Fleet management"
    ],
    "icon": "car",
    "id": "tp_vehicle",
    "name": "Vehicle Interface"
  },
  {
    "category": "physical_devices",
    "description": "Touch feedback or force-based interface.",
    "examples": [
      "VR haptic gloves",
      "Game controller rumble",
      "Braille display"
    ],
    "icon": "vibrate",
    "id": "tp_haptic",
    "name": "Haptic Device"
  },
  {
    "category": "physical_devices",
    "description": "Environmental information display without active interaction.",
    "examples": [
      "Smart mirror",
      "LED status strip",
      "Philips Hue scenes"
    ],
    "icon": "lightbulb",
    "id": "tp_ambient",
    "name": "Ambient Display"
  },
  {
    "category": "physical_devices",
    "description": "Fixed or mounted touchscreen for direct manipulation.",
    "examples": [
      "Wall-mounted tablet",
      "Digital signage",
      "Interactive table",
      "Retail display"
    ],
    "icon": "tablet",
    "id": "tp_touchscreen",
    "name": "Interactive Touchscreen"
  },
  {
    "category": "spatial_computing",
    "description": "Navigable real-time 3D environment with physics and spatial interaction.",
    "examples": [
      "Video games",
      "Virtual showrooms",
      "3D design tools",
      "Virtual tours",
      "Training simulations"
    ],
    "icon": "box",
    "id": "tp_3d_space",
    "name": "3D Space"
  },
  {
    "category": "physical_devices",
    "description": "Physical controller with buttons, triggers, joysticks, and haptic feedback.",
    "examples": [
      "Console controller",
      "PC gamepad",
      "Flight stick",
      "Racing wheel",
      "Adaptive controller"
    ],
    "icon": "gamepad",
    "id": "tp_game_controller",
    "name": "Game Controller"
  },
  {
    "category": "screen_interface",
    "description": "Non-intrusive overlay UI displaying contextual information without blocking main view.",
    "examples": [
      "Gaming HUD",
      "Car dashboard overlay",
      "AR glasses UI",
      "Pilot instruments",
      "Sports analytics overlay"
    ],
    "icon": "crosshair",
    "id": "tp_overlay_hud",
    "name": "Overlay HUD"
  },
  {
    "category": "screen_interface",
    "description": "Text entry field for typing information - single line, multi-line, or specialized formats.",
    "examples": [
      "Login forms",
      "Search bars",
      "Comment boxes",
      "Chat input",
      "Password fields",
      "Text areas"
    ],
    "icon": "form-input",
    "id": "tp_text_input",
    "name": "Text Input Field"
  },
  {
    "category": "screen_interface",
    "description": "Clickable element that triggers an action when pressed.",
    "examples": [
      "Submit button",
      "Cancel",
      "Save",
      "Delete",
      "CTA buttons",
      "Icon buttons",
      "Links as buttons"
    ],
    "icon": "mouse-pointer",
    "id": "tp_button",
    "name": "Button"
  },
  {
    "category": "screen_interface",
    "description": "UI for choosing one or more options from a set - dropdowns, checkboxes, radio buttons, toggles.",
    "examples": [
      "Settings toggles",
      "Form dropdowns",
      "Checkboxes",
      "Radio buttons",
      "Multi-select",
      "Filter controls"
    ],
    "icon": "check-square",
    "id": "tp_selection_control",
    "name": "Selection Control"
  },
  {
    "category": "screen_interface",
    "description": "Continuous value adjustment control - sliding, dialing, or stepping through a range.",
    "examples": [
      "Volume control",
      "Brightness slider",
      "Zoom level",
      "Video scrubber",
      "Price range",
      "Rating stars"
    ],
    "icon": "sliders",
    "id": "tp_slider",
    "name": "Slider/Dial"
  },
  {
    "category": "screen_interface",
    "description": "Control for selecting files from device storage or capturing media.",
    "examples": [
      "Photo upload",
      "Document attachment",
      "Profile picture",
      "Drag-drop zone",
      "Camera capture"
    ],
    "icon": "upload",
    "id": "tp_file_picker",
    "name": "File Picker"
  },
  {
    "category": "screen_interface",
    "description": "Clickable text or element that navigates to another page, section, or resource.",
    "examples": [
      "Text links",
      "Navigation menus",
      "Breadcrumbs",
      "Anchor links",
      "External links",
      "Deep links"
    ],
    "icon": "link",
    "id": "tp_link",
    "name": "Link/Hyperlink"
  },
  {
    "category": "screen_interface",
    "description": "Interactive area for dragging and dropping elements to reorder, organize, or upload.",
    "examples": [
      "Kanban boards",
      "File upload zones",
      "List reordering",
      "Dashboard widgets",
      "Image galleries"
    ],
    "icon": "move",
    "id": "tp_drag_drop",
    "name": "Drag & Drop Zone"
  }
] as const;
