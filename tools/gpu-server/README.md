# GPU server scripts

Scripts used on the rented RTX 4090 (Clore order 2419013). No secrets: `jx.py` reads the Jupyter host
and token from files in a local, uncommitted directory.

- `jx.py`: run commands (`run`, `bg`) and move files (`put`, `get`) through the server's Jupyter API.
- `setup.sh`: Blender, toktx and tools on a fresh container. `egl.sh`: NVIDIA user-space GL/EGL/Vulkan
  libraries extracted from `NVIDIA-Linux-x86_64-595.104.02.run` (must match the host driver).
- `anim6.sh` + `review.sh`: rebuild the six agents, QA sheets and turntables.
- `bisect.sh`, `vk.sh`, `vkall.sh`: capture GPU-path bisect and the five videos at 1080p60 and 4K
  (see `docs/handoff/agent-reports/trailer-gpu-render.md`).
- `gamebuild.sh`, `ingame.sh`, `ingame.cjs`, `cap.cjs`: build the game and screenshot it on real WebGL.

What exists only on the server: `docs/art/server-inventory.md`.
