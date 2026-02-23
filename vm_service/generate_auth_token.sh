export AUTH_TOKEN=$(openssl rand -hex 32)
echo "Generated AUTH_TOKEN: $AUTH_TOKEN"
echo "Please add the following line to your .env file:"
echo "AUTH_TOKEN=$AUTH_TOKEN"   