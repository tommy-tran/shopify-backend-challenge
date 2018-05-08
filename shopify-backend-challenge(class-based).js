process.stdin.resume();
process.stdin.setEncoding("ascii");
var input = "";
process.stdin.on("data", function (chunk) {
  input += chunk;
});
process.stdin.on("end", function () {
  // Parse input
  const parsedInput = JSON.parse(input);

  const cart = new Cart(parsedInput, BASE_URL);
  cart.requestingInfo.then(() => {
      cart.printTotal();
  });

});

// Dependencies
const https = require("https");
const querystring = require("querystring");

// Constants
const BASE_URL = "https://backend-challenge-fall-2018.herokuapp.com/carts.json";

class CartRequest {
  constructor(cartInformation, url) {
    this.id = cartInformation.id;
    this.url = url;
  }

  getPagination(queryParameters) {
    const queryURL = this.createQueryURL(queryParameters);
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

  fetchProducts() {
    return new Promise((resolve, reject) => {
      // Make first request to find pagination
      let query = {
        id: this.id,
        page: 1
      };

      this.getPagination(query)
        .then(pagination => {
          const pages = Math.ceil(pagination.total / pagination.per_page);
          let requests = [];
          for (let page = 1; page <= pages; page++) {
            query = {
              id: this.id,
              page: page
            };

            const queryURL = this.createQueryURL(query);

            // Compile all requests (promises)
            requests.push(this.fetchProductPage(queryURL));
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
              reject("Something went wrong with product requests");
            });
        })
        .catch(err => {
          reject(err);
        });
    });
  }



  fetchProductPage(queryURL) {
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

  // Helper methods
  createQueryURL(queryParameters) {
    return BASE_URL + "?" + querystring.stringify(queryParameters);
  }
}

class Cart extends CartRequest {
  constructor(cartInformation, baseURL) {
    super(cartInformation, baseURL);
    this.cartInformation = cartInformation;
    this.products = null;
    this.total = null;
    this.requestingInfo = this.updateCartInformation();
  }
  
  updateCartInformation() {
    return new Promise((resolve, reject) => {
      this.fetchProducts().then(products => {
        this.total = this.calcCartTotal(products);
        this.products = products;
        resolve();
      }).catch(err => reject(err));
    });
  }

  printTotal() {
    console.log(this.toFixedStringify(this.total, 1));
  }

  calcCartTotal(products) {
    // Check for empty products list
    let total = {
      total_amount: 0,
      total_after_discount: 0
    }

    switch (this.cartInformation.discount_type) {
      case "product":
        if (this.cartInformation.product_value) {
          // Product discount
          const beforeCartValue = this.findCartValue(products);
          const afterCartValue = this.findCartValue(
            this.mapProductDiscounts(
              products,
              this.cartInformation.product_value,
              this.cartInformation.discount_value
            )
          );
          total = {
            total_amount: beforeCartValue,
            total_after_discount: afterCartValue
          };
        } else if (this.cartInformation.collection) {
          // Collection discount
          const beforeCartValue = this.findCartValue(products);
          const afterCartValue = this.findCartValue(
            this.mapCollectionDiscounts(
              products,
              this.cartInformation.collection,
              this.cartInformation.discount_value
            )
          );
          total = {
            total_amount: beforeCartValue,
            total_after_discount: afterCartValue
          };
        } else {
          console.log("Something is wrong with input");
        }
        break;
      case "cart":
        // Cart discount
        const beforeCartValue = this.findCartValue(products);
        const afterCartValue = this.calculateCartDiscount(
          products,
          this.cartInformation.cart_value,
          this.cartInformation.discount_value
        );
        total = {
          total_amount: beforeCartValue,
          total_after_discount: afterCartValue
        };
        break;
      default:
        throw new Error("Invalid input");
    }

    return total;
  }

  findCartValue(products) {
    let price = 0;
    products.forEach(product => {
      price = price + product.price;
    });
    return price;
  }

  mapCollectionDiscounts(products, collection, discount) {
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

  mapProductDiscounts(products, value, discount) {
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

  calculateCartDiscount(products, minimumValue, discount) {
    const cartValue = this.findCartValue(products);
    if (cartValue >= minimumValue) {
      return cartValue - discount < 0 ? 0 : cartValue - discount;
    }
  }

  // Custom stringify helper
  toFixedStringify(cartTotal, precision) {
    cartTotal = {
      total_amount: cartTotal.total_amount.toFixed(precision),
      total_after_discount: cartTotal.total_after_discount.toFixed(precision)
    };

    let result = JSON.stringify(cartTotal, null, "  ");

    result = result.replace(/"(\d.*?)"/g, match => {
      return match.replace(/"/g, "");
    });
    return result;
  }
}