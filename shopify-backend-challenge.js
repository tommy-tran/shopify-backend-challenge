process.stdin.resume();
process.stdin.setEncoding("ascii");
var input = "";
process.stdin.on("data", function(chunk) {
  input += chunk;
});
process.stdin.on("end", function() {
  // Parse input
  const parsedInput = JSON.parse(input);

  // Make request
  fetchProducts(parsedInput.id)
    .then(products => {
      printCartTotals(parsedInput, products);
    })
    .catch(err => {
      console.log(err);
    });
});

// Dependencies
const https = require("https");
const querystring = require("querystring");

// Constants
const BASE_URL = "https://backend-challenge-fall-2018.herokuapp.com/carts.json";

// Helpers
function createQueryURL(queryParameters) {
  return BASE_URL + "?" + querystring.stringify(queryParameters);
}

function toFixedStringify(cartTotal) {
  cartTotal = {
    total_amount: cartTotal.total_amount.toFixed(1),
    total_after_discount: cartTotal.total_after_discount.toFixed(1)
  };

  let result = JSON.stringify(cartTotal, null, "  ");

  result = result.replace(/"(\d.*?)"/g, match => {
    return match.replace(/"/g, "");
  });
  return result;
}

// Request functions
function fetchProducts(id) {
  return new Promise((resolve, reject) => {
    // Must make first request to find pagination
    let query = {
      id: id,
      page: 1
    };

    getPagination(query)
      .then(pagination => {
        const pages = Math.ceil(pagination.total / pagination.per_page);
        let requests = [];
        for (let page = 1; page <= pages; page++) {
          query = {
            id: id,
            page: page
          };

          let queryURL = createQueryURL(query);

          // Compile all requests (promises)
          requests.push(fetchProductPage(queryURL));
        }

        Promise.all(requests)
          .then(results => {
            // Flatten results
            const products = results.reduce((total, next) => {
              return [...total, ...next];
            }, []);
            resolve(products);
          })
          .catch(err => {
            reject("Something went wrong with product requests.");
          });
      })
      .catch(err => {
        reject(err);
      });
  });
}

function getPagination(queryParameters) {
  let queryURL = createQueryURL(queryParameters);
  return new Promise((resolve, reject) => {
    https.get(queryURL, res => {
      let body = "";

      res.on("data", chunk => {
        body += chunk;
      });

      res.on("end", () => {
        const response = JSON.parse(body);
        if (response.pagination) {
          resolve(response.pagination);
        } else {
          reject("Error getting pagination");
        }
      });

      res.on("error", err => {
        reject(err);
      });
    });
  });
}

function fetchProductPage(queryURL) {
  return new Promise((resolve, reject) => {
    let products = [];
    https.get(queryURL, res => {
      let body = "";

      res.on("data", chunk => {
        body += chunk;
      });

      res.on("end", () => {
        const response = JSON.parse(body);

        response.products.forEach(product => {
          products.push(product);
        });

        resolve(products);
      });

      res.on("error", err => {
        reject(err);
      });
    });
  });
}

// Discount Functions
function findCartValue(products) {
  let price = 0;
  products.forEach(product => {
    price = price + product.price;
  });
  return price;
}

function mapCollectionDiscounts(products, collection, discount) {
  return products.map(item => {
    if (item.collection && item.collection === collection) {
      const discountItem = {
        name: item.name,
        price: item.price - discount < 0 ? 0 : item.price - discount,
        collection: item.collection
      };
      return discountItem;
    }

    return item;
  });
}

function mapProductDiscounts(products, value, discount) {
  return products.map(item => {
    if (item.price >= value) {
      const discountItem = {
        name: item.name,
        price: item.price - discount < 0 ? 0 : item.price - discount
      };
      return discountItem;
    }

    return item;
  });
}

function calculateCartDiscount(products, minimumValue, discount) {
  const cartValue = findCartValue(products);
  if (cartValue >= minimumValue) {
    return cartValue - discount < 0 ? 0 : cartValue - discount;
  }
}

// Main Functions
function printCartTotals(input, products) {
  // Check for empty products list
  if (!(products.length > 0)) {
    const cart = {
      total_amount: 0,
      total_after_discount: 0
    };
    console.log(toFixedStringify(cart));
  }

  switch (input.discount_type) {
    case "product":
      if (input.product_value) {
        // Product discount
        const beforeCartValue = findCartValue(products);
        const afterCartValue = findCartValue(
          mapProductDiscounts(
            products,
            input.product_value,
            input.discount_value
          )
        );
        const cart = {
          total_amount: beforeCartValue,
          total_after_discount: afterCartValue
        };
        console.log(toFixedStringify(cart));
      } else if (input.collection) {
        // Collection discount
        const beforeCartValue = findCartValue(products);
        const afterCartValue = findCartValue(
          mapCollectionDiscounts(
            products,
            input.collection,
            input.discount_value
          )
        );
        const cart = {
          total_amount: beforeCartValue,
          total_after_discount: afterCartValue
        };
        console.log(toFixedStringify(cart));
      } else {
        console.error("Something is wrong with input");
      }
      break;
    case "cart":
      // Cart discount
      const beforeCartValue = findCartValue(products);
      const afterCartValue = calculateCartDiscount(
        products,
        input.cart_value,
        input.discount_value
      );
      const cart = {
        total_amount: beforeCartValue,
        total_after_discount: afterCartValue
      };
      console.log(toFixedStringify(cart));
      break;
    default:
      throw new Error("Invalid input");
  }
}
