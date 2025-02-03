# Use Nginx as the base image
FROM nginx:alpine

# Copy the frontend files to the Nginx HTML directory
COPY . /usr/share/nginx/html

# Expose the default HTTP port (80)
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
