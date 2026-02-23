# Sample Datasets

This directory contains sample datasets for testing, analysis, and demonstration purposes.

## Available Datasets

### 1. customers.csv
**Description**: Customer information including demographics and purchase history.

**Columns**:
- `customer_id`: Unique customer identifier
- `first_name`: Customer's first name
- `last_name`: Customer's last name
- `email`: Email address
- `age`: Customer age
- `country`: Country of residence
- `signup_date`: Date when customer registered
- `total_purchases`: Number of purchases made
- `lifetime_value`: Total amount spent

**Records**: 20 customers

### 2. sales_transactions.csv
**Description**: E-commerce sales transaction records.

**Columns**:
- `transaction_id`: Unique transaction identifier
- `customer_id`: Reference to customer
- `product_id`: Reference to product
- `product_name`: Name of the product
- `category`: Product category
- `quantity`: Number of units purchased
- `unit_price`: Price per unit
- `total_amount`: Total transaction amount
- `transaction_date`: Date of transaction
- `payment_method`: Method of payment used

**Records**: 20 transactions

### 3. employees.csv
**Description**: Employee records with HR information.

**Columns**:
- `employee_id`: Unique employee identifier
- `first_name`: Employee's first name
- `last_name`: Employee's last name
- `department`: Department name
- `position`: Job title
- `hire_date`: Date of hire
- `salary`: Annual salary
- `performance_rating`: Performance score (1-5)
- `years_of_experience`: Total work experience

**Records**: 20 employees

### 4. products.json
**Description**: Product catalog with inventory information (JSON format).

**Fields**:
- `product_id`: Unique product identifier
- `name`: Product name
- `category`: Product category
- `brand`: Brand name
- `price`: Product price
- `stock_quantity`: Current inventory level
- `supplier`: Supplier name
- `rating`: Average customer rating (1-5)
- `reviews_count`: Number of reviews

**Records**: 5 products

## Usage Examples

### Python (Pandas)
```python
import pandas as pd
import json

# Load CSV files
customers = pd.read_csv('sample_datasets/customers.csv')
sales = pd.read_csv('sample_datasets/sales_transactions.csv')
employees = pd.read_csv('sample_datasets/employees.csv')

# Load JSON file
with open('sample_datasets/products.json', 'r') as f:
    products = json.load(f)
    products_df = pd.DataFrame(products)

# Example analysis
print(customers.describe())
print(sales.groupby('category')['total_amount'].sum())
```

### R
```r
# Load CSV files
customers <- read.csv('sample_datasets/customers.csv')
sales <- read.csv('sample_datasets/sales_transactions.csv')
employees <- read.csv('sample_datasets/employees.csv')

# Load JSON file
library(jsonlite)
products <- fromJSON('sample_datasets/products.json')

# Example analysis
summary(customers)
aggregate(total_amount ~ category, data=sales, FUN=sum)
```

## Potential Analyses

- **Customer Segmentation**: Group customers by demographics and purchase behavior
- **Sales Analysis**: Identify trends, popular products, and revenue patterns
- **HR Analytics**: Analyze salary distribution, performance metrics, and retention
- **Inventory Management**: Monitor stock levels and reorder patterns
- **Cross-dataset Joins**: Combine datasets for comprehensive business insights

## License
These datasets are for educational and demonstration purposes only.
