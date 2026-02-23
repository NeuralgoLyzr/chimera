#!/bin/bash
set -e

echo "========================================="
echo "  Beta9 (Beam OSS) Local Deployment"
echo "========================================="

# --- Pre-flight checks ---
echo ""
echo "[1/7] Checking prerequisites..."

if ! command -v kubectl &> /dev/null; then
  echo "ERROR: kubectl not found. Install it first."
  exit 1
fi

if ! command -v helm &> /dev/null; then
  echo "ERROR: helm not found. Install with: brew install helm"
  exit 1
fi

if ! kubectl cluster-info &> /dev/null; then
  echo "ERROR: Kubernetes is not running."
  echo "Enable Kubernetes in Docker Desktop: Settings -> Kubernetes -> Enable Kubernetes"
  exit 1
fi

echo "kubectl and helm found. Kubernetes is running."

# --- Install Localstack (S3 storage) ---
echo ""
echo "[2/7] Installing Localstack (S3-compatible storage)..."

helm repo add localstack https://localstack.github.io/helm-charts 2>/dev/null || true
helm repo update localstack

if helm status localstack &> /dev/null; then
  echo "Localstack already installed. Upgrading..."
  HELM_CMD="helm upgrade"
else
  HELM_CMD="helm install"
fi

$HELM_CMD localstack localstack/localstack --values=- <<EOF
extraEnvVars:
- name: SERVICES
  value: "s3"
enableStartupScripts: true
startupScriptContent: |
  #!/bin/bash
  awslocal s3 mb s3://juicefs
  awslocal s3 mb s3://logs
persistence:
  enabled: true
  storageClass: hostpath
  accessModes:
  - ReadWriteOnce
  size: 50Gi
EOF

# --- Pull gateway image for ARM Macs ---
echo ""
echo "[3/7] Pre-pulling Beta9 gateway image (amd64)..."

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  echo "ARM Mac detected. Pulling amd64 image via Rosetta..."
  docker pull --platform linux/amd64 public.ecr.aws/n4e0e1y0/beta9-gateway:0.1.166
else
  echo "x86 architecture detected. No platform override needed."
fi

# --- Install Beta9 ---
echo ""
echo "[4/7] Installing Beta9 helm chart..."

if helm status beta9 &> /dev/null; then
  echo "Beta9 already installed. Upgrading..."
  HELM_CMD="helm upgrade"
else
  HELM_CMD="helm install"
fi

$HELM_CMD beta9 oci://public.ecr.aws/n4e0e1y0/beta9-chart --version 0.1.166 \
  --set postgresql.image.tag=latest \
  --set postgresql.volumePermissions.image.tag=latest \
  --set redis.image.tag=latest \
  --set juicefs-redis.image.tag=latest

# --- Fix PVCs for Docker Desktop ---
echo ""
echo "[5/7] Ensuring PersistentVolumeClaims use hostpath storage..."

for PVC_NAME in beta9-images localstack; do
  PVC_STATUS=$(kubectl get pvc "$PVC_NAME" -o jsonpath='{.status.phase}' 2>/dev/null || echo "NotFound")
  if [ "$PVC_STATUS" = "Pending" ] || [ "$PVC_STATUS" = "NotFound" ]; then
    kubectl delete pvc "$PVC_NAME" 2>/dev/null || true
    kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: $PVC_NAME
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: hostpath
  resources:
    requests:
      storage: 50Gi
EOF
  fi
done

# --- Wait for pods ---
echo ""
echo "[6/7] Waiting for all pods to be ready (up to 3 minutes)..."

TIMEOUT=180
ELAPSED=0
INTERVAL=10

while [ $ELAPSED -lt $TIMEOUT ]; do
  READY=$(kubectl get pods --no-headers 2>/dev/null | awk '{print $2}' | grep -c "1/1" || true)
  TOTAL=$(kubectl get pods --no-headers 2>/dev/null | wc -l | tr -d ' ')

  echo "  Pods ready: $READY/$TOTAL (${ELAPSED}s elapsed)"

  if [ "$READY" -eq "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
    echo "All pods are running!"
    break
  fi

  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  echo "WARNING: Not all pods are ready after ${TIMEOUT}s. Current status:"
  kubectl get pods
  echo ""
  echo "You may need to wait longer or check pod logs with: kubectl describe pod <pod-name>"
fi

# --- Port forward ---
echo ""
echo "[7/7] Starting port forwarding (HTTP:1993, gRPC:1994)..."

# Kill any existing port-forward processes
pkill -f "kubectl port-forward svc/beta9-gateway" 2>/dev/null || true
sleep 1

kubectl port-forward svc/beta9-gateway 1993 1994 &
PF_PID=$!

sleep 3

if kill -0 $PF_PID 2>/dev/null; then
  echo ""
  echo "========================================="
  echo "  Beta9 is deployed and running!"
  echo "========================================="
  echo ""
  echo "  HTTP:  http://localhost:1993"
  echo "  gRPC:  localhost:1994"
  echo ""
  echo "  Port-forward PID: $PF_PID"
  echo "  Stop with: kill $PF_PID"
  echo ""
  echo "  Next step: Configure the CLI with ./beta9"
  echo "========================================="
else
  echo "ERROR: Port forwarding failed to start."
  exit 1
fi

wait $PF_PID
